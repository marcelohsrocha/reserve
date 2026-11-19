import type { Ocorrencia } from '@prisma/client';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { comTrava, emParalelo } from '@/lib/trava';
import { agenda } from '@/integrations/google';
import { gerarOcorrencias, type Intervalo, type Recorrencia } from '@/domain/ocorrencias';
import { STATUS_ATIVOS } from '@/domain/status';
import type { Conflito } from '@/domain/conflito';
import { verificarConflitos } from './ocupacao';
import { corDoAndar } from './configuracao';
import { eventoDaOcorrencia } from './eventos-google';
import { espelhar, marcarEspelhoCancelado } from './espelho';
import { ErroConflito, ErroNegocio } from './erros';
import { tituloPadronizado } from '@/domain/prefixo';

export interface NovaReserva extends Recorrencia {
  salaId: string;
  pessoaId: string;
  titulo: string;
}

const LIMITE_GOOGLE = 5;

async function salaAtiva(salaId: string) {
  const sala = await db.sala.findUnique({ where: { id: salaId } });
  if (!sala) throw new ErroNegocio('Sala não encontrada.');
  if (!sala.ativa) throw new ErroNegocio(`A sala está desativada.`);
  return sala;
}

/** Prévia: ocorrências que seriam geradas e conflitos encontrados (não grava nada). */
export async function previaReserva(input: NovaReserva) {
  const sala = await salaAtiva(input.salaId);
  const ocorrencias = gerarOcorrencias(input);
  const conflitos = await verificarConflitos(sala.numero, ocorrencias);
  return { ocorrencias, conflitos };
}

/** Cria a reserva, suas ocorrências e um evento no Google por ocorrência. */
export async function criarReserva(input: NovaReserva, quem: string, agora = new Date()) {
  const titulo = input.titulo.trim();
  if (!titulo) throw new ErroNegocio('Informe o título/finalidade.');
  const pessoa = await db.pessoa.findUnique({ where: { id: input.pessoaId } });
  if (!pessoa) throw new ErroNegocio('Pessoa responsável não encontrada.');

  return comTrava(`sala:${input.salaId}`, async () => {
    const sala = await salaAtiva(input.salaId);
    const intervalos = gerarOcorrencias(input);
    if (intervalos.some((i) => i.fim <= agora)) throw new ErroNegocio('Não é possível reservar horários que já terminaram.');

    const conflitos = await verificarConflitos(sala.numero, intervalos);
    if (conflitos.length) throw new ErroConflito(conflitos);

    const reserva = await db.reserva.create({
      data: {
        salaId: sala.id,
        pessoaId: pessoa.id,
        titulo,
        dataInicio: input.dataInicio,
        dataFim: input.dataFim,
        horaInicio: input.horaInicio,
        horaFim: input.horaFim,
        diasSemana: input.diasSemana?.length ? input.diasSemana.join(',') : null,
        criadoPor: quem,
        ocorrencias: {
          create: intervalos.map((i) => ({ salaId: sala.id, inicioUtc: i.inicio, fimUtc: i.fim })),
        },
      },
      include: { ocorrencias: { orderBy: { inicioUtc: 'asc' } }, pessoa: true },
    });

    const colorId = await corDoAndar(sala.andar);
    const criados: string[] = [];
    try {
      await emParalelo(reserva.ocorrencias, LIMITE_GOOGLE, async (o) => {
        const ev = eventoDaOcorrencia(sala, reserva, o, colorId);
        const id = await agenda().criar(ev);
        criados.push(id);
        await db.ocorrencia.update({ where: { id: o.id }, data: { googleEventId: id } });
        await espelhar(id, {
          titulo: ev.titulo,
          inicioUtc: o.inicioUtc,
          fimUtc: o.fimUtc,
          salaNumero: sala.numero,
          tipo: 'reserva',
          ocorrenciaId: o.id,
          estado: 'VINCULADO',
        });
      });
    } catch (e) {
      // Desfaz tudo para não deixar a agenda e o banco divergentes.
      await Promise.allSettled(criados.map((id) => agenda().remover(id)));
      await db.eventoGoogle.deleteMany({ where: { googleEventId: { in: criados } } });
      await db.reserva.delete({ where: { id: reserva.id } });
      throw new ErroNegocio('Falha ao gravar no Google Agenda. Nada foi salvo; tente novamente.', String(e));
    }

    await auditar(quem, 'criar', 'reserva', reserva.id, {
      sala: sala.numero,
      titulo,
      ocorrencias: reserva.ocorrencias.length,
    });
    publicar('reservas', { salaId: sala.id });
    return db.reserva.findUniqueOrThrow({
      where: { id: reserva.id },
      include: { ocorrencias: { orderBy: { inicioUtc: 'asc' } }, pessoa: true },
    });
  });
}

/** Edita título e/ou responsável, atualizando os eventos futuros no Google. */
export async function editarReserva(id: string, dados: { titulo?: string; pessoaId?: string }, quem: string, agora = new Date()) {
  const atual = await db.reserva.findUnique({ where: { id } });
  if (!atual) throw new ErroNegocio('Reserva não encontrada.');
  const titulo = dados.titulo?.trim() || atual.titulo;
  const reserva = await db.reserva.update({
    where: { id },
    data: { titulo, pessoaId: dados.pessoaId ?? atual.pessoaId },
    include: { pessoa: true, ocorrencias: { where: { status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora } }, include: { sala: true } } },
  });
  await emParalelo(reserva.ocorrencias, LIMITE_GOOGLE, async (o) => {
    if (!o.googleEventId) return;
    const ev = eventoDaOcorrencia(o.sala, reserva, o, await corDoAndar(o.sala.andar));
    await agenda().atualizar(o.googleEventId, { titulo: ev.titulo, descricao: ev.descricao });
    await db.eventoGoogle.updateMany({ where: { googleEventId: o.googleEventId }, data: { titulo: tituloPadronizado(o.sala.numero, titulo) } });
  });
  await auditar(quem, 'editar', 'reserva', id, { antes: { titulo: atual.titulo, pessoaId: atual.pessoaId }, depois: dados });
  publicar('reservas');
  return reserva;
}

/** Cancela ocorrências (removendo os eventos do Google). */
export async function cancelarOcorrencias(ids: string[], quem: string, motivo = 'cancelada') {
  const ocorrencias = await db.ocorrencia.findMany({ where: { id: { in: ids }, status: { in: STATUS_ATIVOS } } });
  await emParalelo(ocorrencias, LIMITE_GOOGLE, async (o) => {
    await db.ocorrencia.update({ where: { id: o.id }, data: { status: 'CANCELADA' } });
    if (o.googleEventId) {
      await agenda().remover(o.googleEventId);
      await marcarEspelhoCancelado(o.googleEventId);
    }
    await auditar(quem, 'cancelar', 'ocorrencia', o.id, { reservaId: o.reservaId, motivo });
  });
  if (ocorrencias.length) publicar('reservas');
  return ocorrencias.length;
}

/** Cancela todas as ocorrências futuras de uma reserva. */
export async function cancelarReserva(id: string, quem: string, agora = new Date()) {
  const futuras = await db.ocorrencia.findMany({
    where: { reservaId: id, status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora } },
    select: { id: true },
  });
  const n = await cancelarOcorrencias(futuras.map((o) => o.id), quem);
  await auditar(quem, 'cancelar', 'reserva', id, { ocorrencias: n });
  return n;
}

export interface ResultadoTransferencia {
  transferidas: Ocorrencia[];
  naoCouberam: { ocorrencia: Ocorrencia; conflitos: Conflito[] }[];
}

/**
 * Verifica, ocorrência a ocorrência, se cabem na sala de destino. Considera também as que
 * já seriam transferidas antes, para duas ocorrências do lote não colidirem entre si.
 */
export async function simularTransferencia(ids: string[], destinoId: string): Promise<ResultadoTransferencia> {
  const destino = await salaAtiva(destinoId);
  const ocorrencias = await db.ocorrencia.findMany({
    where: { id: { in: ids }, status: { in: STATUS_ATIVOS } },
    orderBy: { inicioUtc: 'asc' },
  });
  const res: ResultadoTransferencia = { transferidas: [], naoCouberam: [] };
  const aceitas: Intervalo[] = [];
  const ignorar = { ocorrenciaIds: new Set(ids) };
  const todos = await verificarConflitos(
    destino.numero,
    ocorrencias.map((o) => ({ inicio: o.inicioUtc, fim: o.fimUtc })),
    ignorar,
  );
  for (const o of ocorrencias) {
    const conflitos = todos.filter((c) => c.pedido.inicio.getTime() === o.inicioUtc.getTime() && c.pedido.fim.getTime() === o.fimUtc.getTime());
    const internos = aceitas.filter((a) => a.inicio < o.fimUtc && o.inicioUtc < a.fim);
    if (conflitos.length || internos.length) {
      res.naoCouberam.push({ ocorrencia: o, conflitos });
    } else {
      res.transferidas.push(o);
      aceitas.push({ inicio: o.inicioUtc, fim: o.fimUtc });
    }
  }
  return res;
}

/** Transfere para a sala de destino as ocorrências que couberem; devolve as que não couberam. */
export async function transferirOcorrencias(ids: string[], destinoId: string, quem: string): Promise<ResultadoTransferencia> {
  return comTrava(`sala:${destinoId}`, async () => {
    const sim = await simularTransferencia(ids, destinoId);
    const destino = await db.sala.findUniqueOrThrow({ where: { id: destinoId } });
    const colorId = await corDoAndar(destino.andar);
    await emParalelo(sim.transferidas, LIMITE_GOOGLE, async (o) => {
      const reserva = await db.reserva.findUniqueOrThrow({ where: { id: o.reservaId }, include: { pessoa: true } });
      await db.ocorrencia.update({ where: { id: o.id }, data: { salaId: destino.id } });
      if (o.googleEventId) {
        const ev = eventoDaOcorrencia(destino, reserva, o, colorId);
        await agenda().atualizar(o.googleEventId, {
          titulo: ev.titulo,
          location: ev.location,
          colorId: ev.colorId,
          privado: { salaNumero: String(destino.numero) },
        });
        await espelhar(o.googleEventId, {
          titulo: ev.titulo,
          inicioUtc: o.inicioUtc,
          fimUtc: o.fimUtc,
          salaNumero: destino.numero,
          tipo: 'reserva',
          ocorrenciaId: o.id,
          estado: 'VINCULADO',
        });
      }
      await auditar(quem, 'transferir', 'ocorrencia', o.id, { de: o.salaId, para: destino.id });
    });
    // Se todas as ocorrências futuras da reserva mudaram, a reserva passa a ser da nova sala.
    const reservaIds = [...new Set(sim.transferidas.map((o) => o.reservaId))];
    for (const rid of reservaIds) {
      const restantes = await db.ocorrencia.count({
        where: { reservaId: rid, status: { in: STATUS_ATIVOS }, salaId: { not: destino.id } },
      });
      if (restantes === 0) await db.reserva.update({ where: { id: rid }, data: { salaId: destino.id } });
    }
    if (sim.transferidas.length) publicar('reservas');
    return sim;
  });
}

/** Remarca uma única ocorrência (mesma sala ou outra). */
export async function remarcarOcorrencia(
  id: string,
  dados: { data: string; horaInicio: string; horaFim: string; salaId?: string },
  quem: string,
  agora = new Date(),
) {
  const o = await db.ocorrencia.findUnique({ where: { id }, include: { reserva: { include: { pessoa: true } } } });
  if (!o || !STATUS_ATIVOS.includes(o.status as never)) throw new ErroNegocio('Ocorrência não pode ser remarcada.');
  const salaId = dados.salaId || o.salaId;
  return comTrava(`sala:${salaId}`, async () => {
    const sala = await salaAtiva(salaId);
    const [intervalo] = gerarOcorrencias({ dataInicio: dados.data, dataFim: dados.data, horaInicio: dados.horaInicio, horaFim: dados.horaFim });
    if (intervalo.fim <= agora) throw new ErroNegocio('O novo horário já passou.');
    const conflitos = await verificarConflitos(sala.numero, [intervalo], { ocorrenciaIds: new Set([id]) });
    if (conflitos.length) throw new ErroConflito(conflitos);
    const atualizada = await db.ocorrencia.update({
      where: { id },
      data: { salaId: sala.id, inicioUtc: intervalo.inicio, fimUtc: intervalo.fim, status: 'AGENDADA', checkinEm: null },
    });
    if (o.googleEventId) {
      const ev = eventoDaOcorrencia(sala, o.reserva, atualizada, await corDoAndar(sala.andar));
      await agenda().atualizar(o.googleEventId, { ...ev, privado: { salaNumero: String(sala.numero) } });
      await espelhar(o.googleEventId, {
        titulo: ev.titulo,
        inicioUtc: intervalo.inicio,
        fimUtc: intervalo.fim,
        salaNumero: sala.numero,
        tipo: 'reserva',
        ocorrenciaId: id,
        estado: 'VINCULADO',
      });
    }
    await auditar(quem, 'remarcar', 'ocorrencia', id, {
      antes: { salaId: o.salaId, inicio: o.inicioUtc, fim: o.fimUtc },
      depois: { salaId: sala.id, inicio: intervalo.inicio, fim: intervalo.fim },
    });
    publicar('reservas');
    return atualizada;
  });
}

/** Ocorrências ainda não terminadas de uma sala (usadas em desativação e bloqueio). */
export async function ocorrenciasFuturasDaSala(salaId: string, agora = new Date(), janela?: Intervalo) {
  return db.ocorrencia.findMany({
    where: {
      salaId,
      status: { in: STATUS_ATIVOS },
      fimUtc: { gt: janela ? janela.inicio : agora },
      ...(janela && { inicioUtc: { lt: janela.fim } }),
    },
    include: { reserva: { include: { pessoa: true } } },
    orderBy: { inicioUtc: 'asc' },
  });
}


/**
 * Libera a sala antes do horário de término: a ocorrência em andamento é finalizada agora
 * e o evento do Google é encurtado até o horário atual.
 */
export async function liberarOcorrencia(id: string, quem: string, agora = new Date()) {
  const o = await db.ocorrencia.findUnique({ where: { id } });
  if (!o) throw new ErroNegocio('Ocorrência não encontrada.');
  if (!STATUS_ATIVOS.includes(o.status as never) || o.inicioUtc > agora || o.fimUtc <= agora) {
    throw new ErroNegocio('Só é possível liberar uma reserva que está acontecendo agora.');
  }
  const r = await db.ocorrencia.updateMany({
    where: { id, status: o.status },
    data: { status: 'FINALIZADA', fimUtc: agora },
  });
  if (r.count === 0) throw new ErroNegocio('A reserva mudou de situação. Atualize a página.');
  if (o.googleEventId) {
    // A sala já está livre no sistema; uma falha no Google (ex.: evento apagado lá) não desfaz isso.
    try {
      await agenda().atualizar(o.googleEventId, { fim: agora });
      await db.eventoGoogle.updateMany({ where: { googleEventId: o.googleEventId }, data: { fimUtc: agora } });
    } catch (e) {
      console.error('[liberar] falha ao encurtar evento no Google', o.googleEventId, e);
    }
  }
  await auditar(quem, 'liberar', 'ocorrencia', id, { fimPrevisto: o.fimUtc, liberadaEm: agora });
  publicar('status', { salaId: o.salaId });
}

import { randomBytes } from 'node:crypto';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { agenda } from '@/integrations/google';
import { codigoSala, locationSala } from '@/domain/sala';
import { STATUS_ATIVOS } from '@/domain/status';
import { corDoAndar } from './configuracao';
import { ErroNegocio } from './erros';
import { ocorrenciasFuturasDaSala } from './reservas';
import { resolverOcorrencias, type Resolucao } from './resolucao';
import { marcarEspelhoCancelado } from './espelho';
import { emParalelo } from '@/lib/trava';
import { reprocessarNaoIdentificados } from './sincronizacao';

export const novoQrToken = () => randomBytes(18).toString('base64url');

/** Próximo número sugerido: maior número que JÁ EXISTIU + 1 (números nunca são reaproveitados). */
export async function proximoNumero(): Promise<number> {
  const [usado, sala] = await Promise.all([
    db.numeroSalaUsado.aggregate({ _max: { numero: true } }),
    db.sala.aggregate({ _max: { numero: true } }),
  ]);
  return Math.max(usado._max.numero ?? 0, sala._max.numero ?? 0) + 1;
}

async function validarNumeroNovo(numero: number) {
  if (!Number.isInteger(numero) || numero < 1 || numero > 9999) throw new ErroNegocio('O número deve ser um inteiro entre 1 e 9999.');
  const [usado, sala] = await Promise.all([
    db.numeroSalaUsado.findUnique({ where: { numero } }),
    db.sala.findUnique({ where: { numero } }),
  ]);
  if (usado || sala) throw new ErroNegocio(`O número ${codigoSala(numero)} já foi usado e não pode ser reaproveitado.`);
}

async function validarNomeUnico(nome: string, ignorarId?: string) {
  const ativas = await db.sala.findMany({ where: { ativa: true }, select: { id: true, nome: true, numero: true } });
  const igual = ativas.find((s) => s.id !== ignorarId && s.nome.trim().toLowerCase() === nome.trim().toLowerCase());
  if (igual) throw new ErroNegocio(`Já existe uma sala ativa com o nome "${igual.nome}" (${codigoSala(igual.numero)}).`);
}

function limpar(dados: { nome: string; andar: string }) {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  const andar = dados.andar.trim().replace(/\s+/g, ' ');
  if (!nome) throw new ErroNegocio('Informe o nome da sala.');
  if (!andar) throw new ErroNegocio('Informe o andar.');
  return { nome, andar };
}

export async function criarSala(dados: { numero?: number | null; nome: string; andar: string }, quem: string) {
  const { nome, andar } = limpar(dados);
  const numero = dados.numero ?? (await proximoNumero());
  await validarNumeroNovo(numero);
  await validarNomeUnico(nome);
  const sala = await db.$transaction(async (tx) => {
    await tx.numeroSalaUsado.create({ data: { numero } });
    return tx.sala.create({ data: { numero, nome, andar, qrToken: novoQrToken() } });
  });
  await auditar(quem, 'criar', 'sala', sala.id, { numero, nome, andar });
  publicar('salas');
  return sala;
}

/** Algo futuro (reserva, bloqueio, evento do Google vinculado) que depende do número da sala? */
async function temCompromissosFuturos(salaId: string, numero: number, agora: Date) {
  const [oc, bl, ev] = await Promise.all([
    db.ocorrencia.count({ where: { salaId, status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora } } }),
    db.bloqueio.count({ where: { salaId, ativo: true, fimUtc: { gt: agora } } }),
    db.eventoGoogle.count({ where: { salaNumero: numero, estado: 'VINCULADO', fimUtc: { gt: agora } } }),
  ]);
  return oc + bl + ev > 0;
}

export async function editarSala(
  id: string,
  dados: { numero: number; nome: string; andar: string },
  quem: string,
  agora = new Date(),
) {
  const sala = await db.sala.findUnique({ where: { id } });
  if (!sala) throw new ErroNegocio('Sala não encontrada.');
  const { nome, andar } = limpar(dados);
  if (dados.numero !== sala.numero) {
    if (await temCompromissosFuturos(sala.id, sala.numero, agora)) {
      throw new ErroNegocio(
        `O número da ${codigoSala(sala.numero)} não pode ser alterado porque ela tem reservas, bloqueios ou eventos futuros no Google Agenda.`,
      );
    }
    await validarNumeroNovo(dados.numero);
  }
  if (sala.ativa) await validarNomeUnico(nome, sala.id);

  const atualizada = await db.$transaction(async (tx) => {
    if (dados.numero !== sala.numero) await tx.numeroSalaUsado.create({ data: { numero: dados.numero } });
    return tx.sala.update({ where: { id }, data: { numero: dados.numero, nome, andar } });
  });

  // Nome/andar mudaram: atualiza location e cor dos eventos futuros.
  if (nome !== sala.nome || andar !== sala.andar) {
    const colorId = await corDoAndar(andar);
    const [ocs, bls] = await Promise.all([
      db.ocorrencia.findMany({ where: { salaId: id, status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora }, googleEventId: { not: null } } }),
      db.bloqueio.findMany({ where: { salaId: id, ativo: true, fimUtc: { gt: agora }, googleEventId: { not: null } } }),
    ]);
    await emParalelo([...ocs, ...bls], 5, (x) =>
      agenda().atualizar(x.googleEventId!, { location: locationSala(atualizada), colorId }),
    );
  }
  await auditar(quem, 'editar', 'sala', id, {
    antes: { numero: sala.numero, nome: sala.nome, andar: sala.andar },
    depois: { numero: atualizada.numero, nome, andar },
  });
  publicar('salas');
  return atualizada;
}

/** Reservas futuras que impedem desativar a sala sem uma resolução. */
export async function impactoDesativacao(id: string, agora = new Date()) {
  return ocorrenciasFuturasDaSala(id, agora);
}

export async function desativarSala(id: string, resolucao: Resolucao | undefined, quem: string, agora = new Date()) {
  const sala = await db.sala.findUnique({ where: { id } });
  if (!sala) throw new ErroNegocio('Sala não encontrada.');
  if (!sala.ativa) throw new ErroNegocio('A sala já está desativada.');

  const futuras = await ocorrenciasFuturasDaSala(id, agora);
  const resultado = await resolverOcorrencias(futuras, resolucao, quem, `sala ${codigoSala(sala.numero)} desativada`);

  // Bloqueios futuros deixam de fazer sentido.
  const bloqueios = await db.bloqueio.findMany({ where: { salaId: id, ativo: true, fimUtc: { gt: agora } } });
  for (const b of bloqueios) {
    await db.bloqueio.update({ where: { id: b.id }, data: { ativo: false } });
    if (b.googleEventId) {
      await agenda().remover(b.googleEventId);
      await marcarEspelhoCancelado(b.googleEventId);
    }
  }

  await db.sala.update({ where: { id }, data: { ativa: false, desativadaEm: agora } });
  // Eventos do Google com o prefixo desta sala vão para a fila "Eventos não identificados".
  await db.eventoGoogle.updateMany({
    where: { salaNumero: sala.numero, estado: 'VINCULADO', tipo: 'externo' },
    data: { estado: 'NAO_IDENTIFICADO' },
  });
  await auditar(quem, 'desativar', 'sala', id, { numero: sala.numero, ...resultado, resolucao: resolucao?.acao ?? null });
  publicar('salas');
  return resultado;
}

export async function reativarSala(id: string, quem: string) {
  const sala = await db.sala.findUnique({ where: { id } });
  if (!sala) throw new ErroNegocio('Sala não encontrada.');
  if (sala.ativa) throw new ErroNegocio('A sala já está ativa.');
  await validarNomeUnico(sala.nome, sala.id);
  // Mesmo número, QR NOVO: o QR antigo continua inválido.
  const reativada = await db.sala.update({ where: { id }, data: { ativa: true, desativadaEm: null, qrToken: novoQrToken() } });
  await auditar(quem, 'reativar', 'sala', id, { numero: sala.numero });
  await reprocessarNaoIdentificados();
  publicar('salas');
  return reativada;
}

export async function regenerarQr(id: string, quem: string) {
  const sala = await db.sala.update({ where: { id }, data: { qrToken: novoQrToken() } });
  await auditar(quem, 'regenerar_qr', 'sala', id, { numero: sala.numero });
  return sala;
}

/** Exclusão definitiva: só para salas sem nenhum histórico. O número continua "usado". */
export async function excluirSala(id: string, quem: string) {
  const sala = await db.sala.findUnique({
    where: { id },
    include: { _count: { select: { reservas: true, ocorrencias: true, bloqueios: true } } },
  });
  if (!sala) throw new ErroNegocio('Sala não encontrada.');
  const { reservas, ocorrencias, bloqueios } = sala._count;
  if (reservas + ocorrencias + bloqueios > 0) {
    throw new ErroNegocio('Esta sala tem histórico de reservas ou bloqueios. Use "Desativar" em vez de excluir.');
  }
  await db.sala.delete({ where: { id } });
  await auditar(quem, 'excluir', 'sala', id, { numero: sala.numero, nome: sala.nome });
  publicar('salas');
}

export async function listarSalas(filtro: 'ativas' | 'desativadas' | 'todas' = 'ativas') {
  return db.sala.findMany({
    where: filtro === 'todas' ? {} : { ativa: filtro === 'ativas' },
    orderBy: [{ andar: 'asc' }, { numero: 'asc' }],
    include: { _count: { select: { reservas: true, bloqueios: true } } },
  });
}

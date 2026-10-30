import { randomUUID } from 'node:crypto';
import type { Sala } from '@prisma/client';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { comTrava } from '@/lib/trava';
import { env } from '@/lib/env';
import { agenda, SyncTokenInvalido, type EventoAgenda } from '@/integrations/google';
import { lerPrefixo, tituloPadronizado } from '@/domain/prefixo';
import { locationSala } from '@/domain/sala';
import { STATUS_ATIVOS } from '@/domain/status';
import { corDoAndar, obterConfiguracao } from './configuracao';
import { espelhar } from './espelho';
import { ErroConflito, ErroNegocio } from './erros';
import { verificarConflitos } from './ocupacao';

const SISTEMA = 'google-agenda';

/** Padroniza um evento externo para a sala: título [Snn], location, cor e salaNumero. */
async function padronizarEvento(id: string, titulo: string, sala: Sala) {
  await agenda().atualizar(id, {
    titulo: tituloPadronizado(sala.numero, titulo),
    location: locationSala(sala),
    colorId: await corDoAndar(sala.andar),
    privado: { salaNumero: String(sala.numero), tipo: 'externo' },
  });
}

/** Processa um evento recebido do Google (sync incremental). Devolve true se algo mudou. */
export async function processarEvento(ev: EventoAgenda, agora = new Date()): Promise<boolean> {
  const existente = await db.eventoGoogle.findUnique({ where: { googleEventId: ev.id } });
  const ocorrencia = ev.privado.ocorrenciaId
    ? await db.ocorrencia.findUnique({ where: { id: ev.privado.ocorrenciaId } })
    : await db.ocorrencia.findUnique({ where: { googleEventId: ev.id } });
  const bloqueio = ev.privado.bloqueioId
    ? await db.bloqueio.findUnique({ where: { id: ev.privado.bloqueioId } })
    : await db.bloqueio.findUnique({ where: { googleEventId: ev.id } });

  if (ev.cancelado) {
    if (existente) await db.eventoGoogle.update({ where: { googleEventId: ev.id }, data: { estado: 'CANCELADO' } });
    // Evento do sistema apagado direto no Google: o Google é a fonte da verdade.
    if (ocorrencia && STATUS_ATIVOS.includes(ocorrencia.status as never) && ocorrencia.fimUtc > agora) {
      await db.ocorrencia.update({ where: { id: ocorrencia.id }, data: { status: 'CANCELADA' } });
      await auditar(SISTEMA, 'cancelar', 'ocorrencia', ocorrencia.id, { motivo: 'evento removido no Google Agenda' });
    }
    if (bloqueio?.ativo) {
      await db.bloqueio.update({ where: { id: bloqueio.id }, data: { ativo: false } });
      await auditar(SISTEMA, 'remover_bloqueio', 'bloqueio', bloqueio.id, { motivo: 'evento removido no Google Agenda' });
    }
    return Boolean(existente && existente.estado !== 'CANCELADO');
  }

  if (ocorrencia) {
    const sala = await db.sala.findUniqueOrThrow({ where: { id: ocorrencia.salaId } });
    const mudouHorario = ocorrencia.inicioUtc.getTime() !== ev.inicio.getTime() || ocorrencia.fimUtc.getTime() !== ev.fim.getTime();
    if (mudouHorario && STATUS_ATIVOS.includes(ocorrencia.status as never)) {
      await db.ocorrencia.update({ where: { id: ocorrencia.id }, data: { inicioUtc: ev.inicio, fimUtc: ev.fim } });
      await auditar(SISTEMA, 'remarcar', 'ocorrencia', ocorrencia.id, { inicio: ev.inicio, fim: ev.fim, motivo: 'alterado no Google Agenda' });
    }
    await espelhar(ev.id, {
      titulo: ev.titulo,
      inicioUtc: ev.inicio,
      fimUtc: ev.fim,
      salaNumero: sala.numero,
      tipo: 'reserva',
      ocorrenciaId: ocorrencia.id,
      estado: 'VINCULADO',
    });
    return mudouHorario || !existente;
  }

  if (bloqueio) {
    const sala = await db.sala.findUniqueOrThrow({ where: { id: bloqueio.salaId } });
    const mudou = bloqueio.inicioUtc.getTime() !== ev.inicio.getTime() || bloqueio.fimUtc.getTime() !== ev.fim.getTime();
    if (mudou && bloqueio.ativo) await db.bloqueio.update({ where: { id: bloqueio.id }, data: { inicioUtc: ev.inicio, fimUtc: ev.fim } });
    await espelhar(ev.id, {
      titulo: ev.titulo,
      inicioUtc: ev.inicio,
      fimUtc: ev.fim,
      salaNumero: sala.numero,
      tipo: 'bloqueio',
      bloqueioId: bloqueio.id,
      estado: 'VINCULADO',
    });
    return mudou || !existente;
  }

  // Evento externo (criado direto no Google): identifica pela propriedade ou pelo prefixo [Snn].
  const numero = ev.privado.salaNumero ? Number(ev.privado.salaNumero) : lerPrefixo(ev.titulo);
  const sala = numero ? await db.sala.findFirst({ where: { numero, ativa: true } }) : null;
  const base = { titulo: ev.titulo, inicioUtc: ev.inicio, fimUtc: ev.fim, salaNumero: numero, tipo: 'externo' as const };

  if (sala) {
    if (!ev.privado.salaNumero || ev.titulo !== tituloPadronizado(sala.numero, ev.titulo)) {
      await padronizarEvento(ev.id, ev.titulo, sala);
      base.titulo = tituloPadronizado(sala.numero, ev.titulo);
    }
    await espelhar(ev.id, { ...base, estado: 'VINCULADO' });
  } else {
    const estado = existente?.estado === 'IGNORADO' ? 'IGNORADO' : 'NAO_IDENTIFICADO';
    await espelhar(ev.id, { ...base, estado });
  }
  return true;
}

/** Sync incremental com syncToken (refaz a sincronização completa se o token expirar). */
export async function sincronizar(): Promise<number> {
  return comTrava('sync-google', async () => {
    const cfg = await obterConfiguracao();
    let resultado;
    try {
      resultado = await agenda().sincronizar(cfg.googleSyncToken);
    } catch (e) {
      if (!(e instanceof SyncTokenInvalido)) throw e;
      resultado = await agenda().sincronizar(null);
    }
    let mudancas = 0;
    for (const ev of resultado.eventos) {
      try {
        if (await processarEvento(ev)) mudancas++;
      } catch (e) {
        console.error('[sync] falha ao processar evento', ev.id, e);
      }
    }
    await db.configuracao.update({
      where: { id: 1 },
      data: { googleSyncToken: resultado.proximoSyncToken, ultimoSyncEm: new Date() },
    });
    if (mudancas) publicar('google', { mudancas });
    return mudancas;
  });
}

let agendado: NodeJS.Timeout | null = null;
/** Webhook: agrupa notificações próximas em um único sync. */
export function agendarSincronizacao(atrasoMs = 1500) {
  if (agendado) return;
  agendado = setTimeout(() => {
    agendado = null;
    sincronizar().catch((e) => console.error('[sync] erro', e));
  }, atrasoMs);
}

/** Vincula com 1 clique um evento da fila "não identificados" a uma sala ativa. */
export async function vincularEvento(googleEventId: string, salaId: string, quem: string) {
  const ev = await db.eventoGoogle.findUnique({ where: { googleEventId } });
  if (!ev || (ev.estado !== 'NAO_IDENTIFICADO' && ev.estado !== 'IGNORADO')) throw new ErroNegocio('Evento não está na fila.');
  const sala = await db.sala.findUnique({ where: { id: salaId } });
  if (!sala?.ativa) throw new ErroNegocio('Sala inválida ou desativada.');
  return comTrava(`sala:${sala.id}`, async () => {
    const conflitos = await verificarConflitos(sala.numero, [{ inicio: ev.inicioUtc, fim: ev.fimUtc }]);
    if (conflitos.length) throw new ErroConflito(conflitos);
    await padronizarEvento(googleEventId, ev.titulo, sala);
    await espelhar(googleEventId, {
      titulo: tituloPadronizado(sala.numero, ev.titulo),
      inicioUtc: ev.inicioUtc,
      fimUtc: ev.fimUtc,
      salaNumero: sala.numero,
      tipo: 'externo',
      estado: 'VINCULADO',
    });
    await auditar(quem, 'vincular', 'evento_google', googleEventId, { sala: sala.numero, titulo: ev.titulo });
    publicar('google');
  });
}

export async function ignorarEvento(googleEventId: string, quem: string) {
  await db.eventoGoogle.update({ where: { googleEventId }, data: { estado: 'IGNORADO' } });
  await auditar(quem, 'ignorar', 'evento_google', googleEventId);
  publicar('google');
}

/** Ao reativar uma sala, os eventos da fila com o número dela voltam a ser vinculados. */
export async function reprocessarNaoIdentificados(agora = new Date()) {
  const pendentes = await db.eventoGoogle.findMany({
    where: { estado: 'NAO_IDENTIFICADO', salaNumero: { not: null }, fimUtc: { gt: agora } },
  });
  for (const ev of pendentes) {
    const sala = await db.sala.findFirst({ where: { numero: ev.salaNumero!, ativa: true } });
    if (!sala) continue;
    try {
      await padronizarEvento(ev.googleEventId, ev.titulo, sala);
      await db.eventoGoogle.update({
        where: { googleEventId: ev.googleEventId },
        data: { estado: 'VINCULADO', titulo: tituloPadronizado(sala.numero, ev.titulo) },
      });
    } catch (e) {
      console.error('[sync] falha ao revincular', ev.googleEventId, e);
    }
  }
}

/** Cria/renova o canal events.watch antes de expirar (24 h de folga). */
export async function garantirObservacao(agora = new Date()) {
  if (env.googleFake || !env.publicBaseUrl.startsWith('https://') || !env.webhookToken) return false;
  const cfg = await obterConfiguracao();
  if (cfg.watchExpiraEm && cfg.watchExpiraEm.getTime() - agora.getTime() > 24 * 3_600_000) return false;
  const canalId = randomUUID();
  const { resourceId, expiracao } = await agenda().observar(canalId, `${env.publicBaseUrl}/api/google/webhook`, env.webhookToken);
  if (cfg.watchChannelId && cfg.watchResourceId) await agenda().pararObservacao(cfg.watchChannelId, cfg.watchResourceId);
  await db.configuracao.update({
    where: { id: 1 },
    data: { watchChannelId: canalId, watchResourceId: resourceId, watchExpiraEm: expiracao },
  });
  console.log(`[google] canal de notificação renovado até ${expiracao.toISOString()}`);
  return true;
}

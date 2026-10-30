import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { comTrava } from '@/lib/trava';
import { env } from '@/lib/env';
import { agenda, SyncTokenInvalido, type EventoAgenda } from '@/integrations/google';
import { STATUS_ATIVOS } from '@/domain/status';
import { obterConfiguracao } from './configuracao';
import { espelhar } from './espelho';
import { atualizarCopiasPessoais } from './agenda-pessoal';

const SISTEMA = 'google-agenda';

/**
 * Processa um evento recebido do Google (sync incremental). Devolve true se algo mudou.
 * Só o sistema cria eventos na agenda única: os eventos dele são reconhecidos pelas propriedades
 * privadas ocorrenciaId/bloqueioId (ou pelo googleEventId gravado).
 */
export async function processarEvento(ev: EventoAgenda, agora = new Date()): Promise<boolean> {
  const existente = await db.eventoGoogle.findUnique({ where: { googleEventId: ev.id } });
  const ocorrencia = ev.privado.ocorrenciaId
    ? await db.ocorrencia.findUnique({ where: { id: ev.privado.ocorrenciaId } })
    : await db.ocorrencia.findUnique({ where: { googleEventId: ev.id } });
  const bloqueio = ev.privado.bloqueioId
    ? await db.bloqueio.findUnique({ where: { id: ev.privado.bloqueioId } })
    : await db.bloqueio.findUnique({ where: { googleEventId: ev.id } });

  if (ev.cancelado) {
    // Eco da remoção de um evento sem identificação: continua registrado como REMOVIDO.
    if (existente?.estado === 'REMOVIDO') return false;
    if (existente) await db.eventoGoogle.update({ where: { googleEventId: ev.id }, data: { estado: 'CANCELADO' } });
    // Evento do sistema apagado direto no Google: o Google é a fonte da verdade.
    if (ocorrencia && STATUS_ATIVOS.includes(ocorrencia.status as never) && ocorrencia.fimUtc > agora) {
      await db.ocorrencia.update({ where: { id: ocorrencia.id }, data: { status: 'CANCELADA' } });
      await auditar(SISTEMA, 'cancelar', 'ocorrencia', ocorrencia.id, { motivo: 'evento removido no Google Agenda' });
      await atualizarCopiasPessoais([ocorrencia.id]);
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
      await atualizarCopiasPessoais([ocorrencia.id]);
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

  // Evento sem identificação (criado direto no Google, fora do sistema): todo evento precisa
  // ter sala e responsável, então ele é apagado da agenda única e o fato fica na auditoria.
  // Eventos que já terminaram são histórico e ficam como estão.
  if (ev.fim <= agora) return false;
  await agenda().remover(ev.id);
  await espelhar(ev.id, {
    titulo: ev.titulo,
    inicioUtc: ev.inicio,
    fimUtc: ev.fim,
    salaNumero: ev.privado.salaNumero ? Number(ev.privado.salaNumero) || null : null,
    tipo: 'externo',
    estado: 'REMOVIDO',
  });
  await auditar(SISTEMA, 'remover_evento_sem_identificacao', 'evento_google', ev.id, {
    titulo: ev.titulo,
    inicio: ev.inicio,
    fim: ev.fim,
    motivo: 'evento criado fora do Sistema de Reservas',
  });
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

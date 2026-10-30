import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { agenda } from '@/integrations/google';
import { proximoStatus, STATUS_ATIVOS } from '@/domain/status';
import { obterConfiguracao } from './configuracao';

const SISTEMA = 'sistema';

/**
 * Job de 1 minuto: AGENDADA → EM_ANDAMENTO → FINALIZADA, e liberação por não comparecimento
 * (encurtando o evento no Google até o horário atual). Toda mudança dispara SSE.
 */
export async function atualizarStatus(agora = new Date()) {
  const cfg = await obterConfiguracao();
  const candidatas = await db.ocorrencia.findMany({
    where: { status: { in: STATUS_ATIVOS }, inicioUtc: { lte: agora } },
  });
  let mudancas = 0;
  for (const o of candidatas) {
    const novo = proximoStatus(o, agora, cfg);
    if (!novo) continue;
    // Atualização condicional: não sobrescreve um check-in feito no mesmo instante.
    const r = await db.ocorrencia.updateMany({ where: { id: o.id, status: o.status }, data: { status: novo } });
    if (r.count === 0) continue;
    mudancas++;
    if (novo === 'NAO_COMPARECEU') {
      if (o.googleEventId) {
        try {
          await agenda().atualizar(o.googleEventId, { fim: agora });
          await db.eventoGoogle.updateMany({ where: { googleEventId: o.googleEventId }, data: { fimUtc: agora } });
        } catch (e) {
          console.error('[status] falha ao encurtar evento', o.googleEventId, e);
        }
      }
      await auditar(SISTEMA, 'nao_compareceu', 'ocorrencia', o.id, { toleranciaMin: cfg.toleranciaCheckinMin });
    }
  }

  // Bloqueios que começaram ou terminaram desde o último minuto.
  const umMinutoAtras = new Date(agora.getTime() - 61_000);
  const bloqueiosVirando = await db.bloqueio.count({
    where: {
      ativo: true,
      OR: [
        { inicioUtc: { gt: umMinutoAtras, lte: agora } },
        { fimUtc: { gt: umMinutoAtras, lte: agora } },
      ],
    },
  });

  if (mudancas) publicar('status', { mudancas });
  if (bloqueiosVirando) publicar('bloqueios');
  publicar('tick');
  return mudancas;
}

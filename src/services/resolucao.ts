import type { Ocorrencia } from '@prisma/client';
import { cancelarOcorrencias, simularTransferencia, transferirOcorrencias } from './reservas';
import { ErroNegocio, descreverConflito } from './erros';
import { codigoSala } from '@/domain/sala';
import { db } from '@/lib/db';
import { dataBR, horaLocal } from '@/lib/tempo';

/** O que fazer com as reservas afetadas por uma desativação ou bloqueio. */
export type Resolucao =
  | { acao: 'transferir'; destinoId: string; cancelarRestantes?: boolean }
  | { acao: 'cancelar' };

export interface ResultadoResolucao {
  transferidas: number;
  canceladas: number;
}

/**
 * Aplica a resolução escolhida pelo admin. Na transferência, se alguma ocorrência não couber na
 * sala de destino, nada é feito, a menos que o admin tenha autorizado cancelar as restantes.
 */
export async function resolverOcorrencias(
  ocorrencias: Ocorrencia[],
  resolucao: Resolucao | undefined,
  quem: string,
  motivo: string,
): Promise<ResultadoResolucao> {
  if (ocorrencias.length === 0) return { transferidas: 0, canceladas: 0 };
  if (!resolucao) {
    throw new ErroNegocio(
      `Existem ${ocorrencias.length} reserva(s) futura(s) afetada(s). Escolha transferir para outra sala ou cancelar antes de concluir.`,
      ocorrencias.map((o) => `${dataBR(o.inicioUtc)} ${horaLocal(o.inicioUtc)}–${horaLocal(o.fimUtc)}`),
    );
  }
  const ids = ocorrencias.map((o) => o.id);
  if (resolucao.acao === 'cancelar') {
    return { transferidas: 0, canceladas: await cancelarOcorrencias(ids, quem, motivo) };
  }

  const destino = await db.sala.findUnique({ where: { id: resolucao.destinoId } });
  if (!destino?.ativa) throw new ErroNegocio('Sala de destino inválida ou desativada.');
  if (ocorrencias.some((o) => o.salaId === destino.id)) throw new ErroNegocio('A sala de destino deve ser outra sala.');

  const sim = await simularTransferencia(ids, destino.id);
  if (sim.naoCouberam.length && !resolucao.cancelarRestantes) {
    throw new ErroNegocio(
      `${sim.naoCouberam.length} ocorrência(s) não cabem na ${codigoSala(destino.numero)}. Escolha outra sala ou autorize cancelar as que não couberem.`,
      sim.naoCouberam.map((n) =>
        n.conflitos.length
          ? descreverConflito(n.conflitos[0])
          : `${dataBR(n.ocorrencia.inicioUtc)} ${horaLocal(n.ocorrencia.inicioUtc)}: colide com outra ocorrência transferida`,
      ),
    );
  }
  const feito = await transferirOcorrencias(ids, destino.id, quem);
  const canceladas = await cancelarOcorrencias(feito.naoCouberam.map((n) => n.ocorrencia.id), quem, `${motivo} (não coube na sala de destino)`);
  return { transferidas: feito.transferidas.length, canceladas };
}

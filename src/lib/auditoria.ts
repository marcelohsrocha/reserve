import { db, type Tx } from './db';

export type Entidade = 'sala' | 'pessoa' | 'reserva' | 'ocorrencia' | 'bloqueio' | 'evento_google' | 'configuracao';

export async function auditar(
  quem: string,
  acao: string,
  entidade: Entidade,
  entidadeId: string,
  detalhes?: Record<string, unknown>,
  tx: Tx = db,
) {
  await tx.auditoria.create({
    data: { quem, acao, entidade, entidadeId, detalhes: detalhes ? JSON.stringify(detalhes) : null },
  });
}

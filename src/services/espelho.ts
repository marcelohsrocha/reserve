import { db, type Tx } from '@/lib/db';

/** Mantém o espelho local (EventoGoogle) de um evento que o próprio sistema criou/alterou. */
export async function espelhar(
  googleEventId: string,
  dados: {
    titulo: string;
    inicioUtc: Date;
    fimUtc: Date;
    salaNumero: number | null;
    tipo: 'reserva' | 'bloqueio' | 'externo';
    ocorrenciaId?: string | null;
    bloqueioId?: string | null;
    estado: 'VINCULADO' | 'CANCELADO' | 'REMOVIDO';
  },
  tx: Tx = db,
) {
  await tx.eventoGoogle.upsert({
    where: { googleEventId },
    create: { googleEventId, ...dados },
    update: dados,
  });
}

export async function marcarEspelhoCancelado(googleEventId: string | null | undefined, tx: Tx = db) {
  if (!googleEventId) return;
  await tx.eventoGoogle.updateMany({ where: { googleEventId }, data: { estado: 'CANCELADO' } });
}

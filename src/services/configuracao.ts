import { db, type Tx } from '@/lib/db';

export async function obterConfiguracao(tx: Tx = db) {
  return tx.configuracao.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** colorId do Google para o andar (ou a cor padrão quando o andar ainda não foi configurado). */
export async function corDoAndar(andar: string, tx: Tx = db): Promise<string> {
  const cor = await tx.corAndar.findUnique({ where: { andar } });
  if (cor) return cor.colorId;
  return (await obterConfiguracao(tx)).corPadrao;
}

export async function andaresUsados(): Promise<string[]> {
  const salas = await db.sala.findMany({ select: { andar: true }, distinct: ['andar'], orderBy: { andar: 'asc' } });
  return salas.map((s) => s.andar);
}

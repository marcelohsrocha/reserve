import { NextResponse } from 'next/server';
import { localParaUtc } from '@/lib/tempo';
import { salasLivres } from '@/services/ocupacao';
import { codigoSala } from '@/domain/sala';

export const dynamic = 'force-dynamic';

/** Salas ativas livres em data/faixa futura: ?data=AAAA-MM-DD&inicio=HH:MM&fim=HH:MM */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const data = u.searchParams.get('data') ?? '';
  const inicio = u.searchParams.get('inicio') ?? '';
  const fim = u.searchParams.get('fim') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fim) || fim <= inicio) {
    return NextResponse.json({ erro: 'Informe data, horário inicial e final válidos.' }, { status: 400 });
  }
  const salas = await salasLivres({ inicio: localParaUtc(data, inicio), fim: localParaUtc(data, fim) });
  return NextResponse.json({
    salas: salas.map((s) => ({ id: s.id, codigo: codigoSala(s.numero), nome: s.nome, andar: s.andar })),
  });
}

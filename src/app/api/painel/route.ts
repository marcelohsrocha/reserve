import { NextResponse } from 'next/server';
import { obterPainel } from '@/services/painel';
import { usuarioOpcional } from '@/lib/usuario';
import { VISAO_ANONIMA } from '@/domain/privacidade';

export const dynamic = 'force-dynamic';

export async function GET() {
  const u = await usuarioOpcional();
  const visao = u ? { id: u.id, admin: u.admin } : VISAO_ANONIMA;
  return NextResponse.json(await obterPainel(new Date(), visao), { headers: { 'Cache-Control': 'no-store' } });
}

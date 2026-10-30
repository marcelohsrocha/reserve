import { NextResponse } from 'next/server';
import { obterPainel } from '@/services/painel';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await obterPainel(), { headers: { 'Cache-Control': 'no-store' } });
}

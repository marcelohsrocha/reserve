import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { AcessoNegado, entrarComGoogle } from '@/services/pessoas';
import { copiarReservasFuturas } from '@/services/agenda-pessoal';
import { concluirLogin, destinoSeguro, irPara } from '@/lib/login';

export const dynamic = 'force-dynamic';

/**
 * Login de DESENVOLVIMENTO (sem Google): simula a conta pelo e-mail digitado, com a agenda
 * pessoal falsa conectada. Só existe fora de produção e sem GOOGLE_OAUTH_CLIENT_ID.
 */
export async function POST(req: NextRequest) {
  if (!env.loginDev) return new Response('Não encontrado', { status: 404 });
  const fd = await req.formData();
  const email = String(fd.get('email') ?? '').trim().toLowerCase();
  const volta = destinoSeguro(String(fd.get('volta') ?? ''));
  try {
    const existente = await db.pessoa.findUnique({ where: { email } });
    const { pessoa, conectouAgora } = await entrarComGoogle({
      email,
      nome: existente?.nome ?? email.split('@')[0],
      refreshToken: existente?.googleRefreshToken ? null : `dev-${email}`,
      agendaAutorizada: true,
    });
    if (conectouAgora) await copiarReservasFuturas(pessoa.id);
    return concluirLogin(pessoa, volta);
  } catch (e) {
    if (e instanceof AcessoNegado) return irPara('/entrar?erro=nao-autorizado');
    throw e;
  }
}

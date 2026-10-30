import { randomBytes } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { urlDeLogin } from '@/integrations/google/oauth';
import { COOKIE_OAUTH, destinoSeguro, irPara } from '@/lib/login';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

/** Início do login: guarda state (anti-CSRF) e destino num cookie curto e vai para o Google. */
export async function GET(req: NextRequest) {
  if (env.loginDev) return irPara('/entrar');
  const state = randomBytes(24).toString('base64url');
  const consentir = req.nextUrl.searchParams.get('consentir') === '1';
  const volta = destinoSeguro(req.nextUrl.searchParams.get('volta'));
  const res = irPara(urlDeLogin(state, consentir));
  res.cookies.set(COOKIE_OAUTH, JSON.stringify({ state, volta, consentir }), {
    httpOnly: true,
    secure: env.publicBaseUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 600,
  });
  return res;
}

import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { env } from '@/lib/env';

/**
 * Login com a conta Google: todas as rotas exigem o cookie de sessão assinado, exceto
 * /checkin/* e /api/google/webhook (públicas por definição), a tela de login, o fluxo OAuth
 * e /api/health (Docker). O id do usuário segue para as páginas no cabeçalho x-usuario-id.
 */
const PUBLICAS = [
  /^\/checkin(\/|$)/,
  /^\/api\/google\/webhook$/,
  /^\/api\/health$/,
  /^\/entrar$/,
  /^\/api\/auth\//,
  /^\/logo\./,
  /^\/favicon/,
];
const CABECALHO_USUARIO = 'x-usuario-id';

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.delete(CABECALHO_USUARIO); // nunca confiar no valor vindo do cliente
  if (PUBLICAS.some((r) => r.test(pathname))) return NextResponse.next({ request: { headers } });

  if (!env.sessionSecret || (!env.loginDev && (!env.oauthClientId || !env.oauthClientSecret))) {
    return new NextResponse('Login Google não configurado (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / SESSION_SECRET).', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) {
    if (pathname.startsWith('/api/')) return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
    const url = new URL('/entrar', env.publicBaseUrl);
    if (pathname !== '/') url.searchParams.set('volta', pathname + search);
    return NextResponse.redirect(url);
  }
  headers.set(CABECALHO_USUARIO, sessao.pessoaId);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image).*)'],
};

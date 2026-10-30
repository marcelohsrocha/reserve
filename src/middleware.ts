import { NextResponse, type NextRequest } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * Defesa em profundidade: além do Cloudflare Access na borda, valida aqui o JWT
 * `Cf-Access-Jwt-Assertion`, para que ninguém na rede local contorne o Access acessando o app direto.
 * Rotas públicas: /checkin/* e /api/google/webhook (e /api/health para o Docker).
 */
const PUBLICAS = [/^\/checkin(\/|$)/, /^\/api\/google\/webhook$/, /^\/api\/health$/, /^\/logo\./, /^\/favicon/];
const CABECALHO_USUARIO = 'x-usuario-email';

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function negar(status: number, mensagem: string) {
  return new NextResponse(mensagem, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.delete(CABECALHO_USUARIO); // nunca confiar no valor vindo do cliente
  if (PUBLICAS.some((r) => r.test(pathname))) return NextResponse.next({ request: { headers } });

  const time = process.env.CF_ACCESS_TEAM_DOMAIN;
  const aud = process.env.CF_ACCESS_AUD;

  if (!time || !aud) {
    if (process.env.NODE_ENV === 'production' && process.env.ACCESS_DISABLED !== '1') {
      return negar(503, 'Cloudflare Access não configurado (CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD).');
    }
    headers.set(CABECALHO_USUARIO, process.env.DEV_USER_EMAIL || 'dev@localhost');
    return NextResponse.next({ request: { headers } });
  }

  const token = req.headers.get('cf-access-jwt-assertion') ?? req.cookies.get('CF_Authorization')?.value;
  if (!token) return negar(403, 'Acesso restrito. Entre pelo endereço público protegido pelo Cloudflare Access.');
  try {
    const dominio = time.replace(/^https?:\/\//, '').replace(/\/$/, '');
    jwks ??= createRemoteJWKSet(new URL(`https://${dominio}/cdn-cgi/access/certs`));
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${dominio}`, audience: aud });
    headers.set(CABECALHO_USUARIO, String(payload.email ?? payload.sub ?? 'desconhecido'));
    return NextResponse.next({ request: { headers } });
  } catch {
    return negar(403, 'Sessão do Cloudflare Access inválida ou expirada.');
  }
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image).*)'],
};

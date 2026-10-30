import { SignJWT, jwtVerify } from 'jose';
import { env } from './env';

/** Cookie de sessão assinado (HS256). Só guarda o id da pessoa; papel e status vêm do banco. */
export const COOKIE_SESSAO = 'ipi_sessao';
export const DURACAO_SESSAO_S = 30 * 86_400;

function segredo() {
  const s = env.sessionSecret;
  if (!s) throw new Error('SESSION_SECRET não configurado.');
  return new TextEncoder().encode(s);
}

export async function assinarSessao(pessoaId: string, email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(pessoaId)
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_S}s`)
    .sign(segredo());
}

export async function lerSessao(token: string | undefined): Promise<{ pessoaId: string; email: string } | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return { pessoaId: payload.sub, email: String(payload.email ?? '') };
  } catch {
    return null;
  }
}

export const opcoesCookie = (segura: boolean) => ({
  httpOnly: true,
  secure: segura,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: DURACAO_SESSAO_S,
});

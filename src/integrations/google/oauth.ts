import { google } from 'googleapis';
import { env } from '@/lib/env';

/**
 * Login com a conta Google (só identidade: openid, e-mail e nome).
 * Não pede acesso à agenda pessoal: escopos básicos não exigem verificação do app no Google.
 */
const ESCOPOS = ['openid', 'email', 'profile'];

export function clienteOAuth() {
  return new google.auth.OAuth2(env.oauthClientId, env.oauthClientSecret, env.oauthRedirectUri);
}

export function urlDeLogin(state: string) {
  return clienteOAuth().generateAuthUrl({
    access_type: 'online',
    scope: ESCOPOS,
    state,
    prompt: 'select_account',
  });
}

export interface ContaGoogle {
  email: string;
  nome: string;
}

export async function trocarCodigo(code: string): Promise<ContaGoogle> {
  const cliente = clienteOAuth();
  const { tokens } = await cliente.getToken(code);
  if (!tokens.id_token) throw new Error('O Google não devolveu o id_token.');
  const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: env.oauthClientId });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw new Error('E-mail da conta Google não verificado.');
  return { email: p.email.toLowerCase(), nome: p.name ?? p.email };
}

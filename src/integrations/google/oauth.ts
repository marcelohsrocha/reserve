import { google } from 'googleapis';
import { env } from '@/lib/env';

/** Login com a conta Google + permissão para gravar eventos na agenda pessoal do usuário. */
export const ESCOPO_AGENDA = 'https://www.googleapis.com/auth/calendar.events';
const ESCOPOS = ['openid', 'email', 'profile', ESCOPO_AGENDA];

export function clienteOAuth() {
  return new google.auth.OAuth2(env.oauthClientId, env.oauthClientSecret, env.oauthRedirectUri);
}

/** `consentir` força a tela de consentimento, necessária para o Google devolver um novo refresh token. */
export function urlDeLogin(state: string, consentir: boolean) {
  return clienteOAuth().generateAuthUrl({
    access_type: 'offline',
    scope: ESCOPOS,
    state,
    include_granted_scopes: true,
    prompt: consentir ? 'consent select_account' : 'select_account',
  });
}

export interface ContaGoogle {
  email: string;
  nome: string;
  refreshToken: string | null;
  agendaAutorizada: boolean;
}

export async function trocarCodigo(code: string): Promise<ContaGoogle> {
  const cliente = clienteOAuth();
  const { tokens } = await cliente.getToken(code);
  if (!tokens.id_token) throw new Error('O Google não devolveu o id_token.');
  const ticket = await cliente.verifyIdToken({ idToken: tokens.id_token, audience: env.oauthClientId });
  const p = ticket.getPayload();
  if (!p?.email || !p.email_verified) throw new Error('E-mail da conta Google não verificado.');
  return {
    email: p.email.toLowerCase(),
    nome: p.name ?? p.email,
    refreshToken: tokens.refresh_token ?? null,
    agendaAutorizada: (tokens.scope ?? '').split(' ').includes(ESCOPO_AGENDA),
  };
}

/** Revoga o acesso do sistema à conta (usado ao desconectar a agenda pessoal). */
export async function revogar(refreshToken: string) {
  try {
    await clienteOAuth().revokeToken(refreshToken);
  } catch {
    // token já inválido
  }
}

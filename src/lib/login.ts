import { NextResponse } from 'next/server';
import { assinarSessao, COOKIE_SESSAO, opcoesCookie } from './sessao';
import { env } from './env';

export const COOKIE_OAUTH = 'ipi_oauth';

/** Só aceita caminhos internos (evita redirecionamento aberto). */
export function destinoSeguro(volta: string | null | undefined) {
  return volta && volta.startsWith('/') && !volta.startsWith('//') && !volta.startsWith('/api/') ? volta : '/admin';
}

export function irPara(caminho: string) {
  return NextResponse.redirect(new URL(caminho, env.publicBaseUrl), 303);
}

/** Grava o cookie de sessão e manda para o primeiro acesso (telefone) ou para o destino. */
export async function concluirLogin(pessoa: { id: string; email: string | null; telefoneE164: string | null }, volta: string) {
  const res = irPara(pessoa.telefoneE164 ? volta : `/primeiro-acesso?volta=${encodeURIComponent(volta)}`);
  res.cookies.set(COOKIE_SESSAO, await assinarSessao(pessoa.id, pessoa.email ?? ''), opcoesCookie(env.publicBaseUrl.startsWith('https://')));
  return res;
}

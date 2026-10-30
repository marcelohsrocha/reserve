import { google } from 'googleapis';
import type { CalendarGateway } from './gateway';
import { AgendaFalsa } from './falso';
import { AgendaGoogle } from './real';
import { clienteOAuth } from './oauth';
import { decifrar } from '@/lib/cripto';
import { env } from '@/lib/env';

const g = globalThis as unknown as { __agendasPessoais?: Map<string, AgendaFalsa> };

/** Agendas pessoais falsas (testes/desenvolvimento), uma por pessoa. */
export function agendasPessoaisFalsas() {
  g.__agendasPessoais ??= new Map();
  return g.__agendasPessoais;
}

/** Agenda principal (primary) do usuário, acessada com o refresh token dele. */
export function agendaPessoal(pessoa: { id: string; googleRefreshToken: string | null }): CalendarGateway {
  if (!pessoa.googleRefreshToken) throw new Error('Agenda pessoal não conectada.');
  if (env.googleFake || env.loginDev) {
    const mapa = agendasPessoaisFalsas();
    if (!mapa.has(pessoa.id)) mapa.set(pessoa.id, new AgendaFalsa());
    return mapa.get(pessoa.id)!;
  }
  const auth = clienteOAuth();
  auth.setCredentials({ refresh_token: decifrar(pessoa.googleRefreshToken) });
  return new AgendaGoogle('primary', google.calendar({ version: 'v3', auth }));
}

/** O usuário revogou o acesso ou o token expirou (ex.: app em modo "Teste" no Google, 7 dias). */
export function tokenRevogado(e: unknown) {
  const m = String((e as { message?: string })?.message ?? '') + JSON.stringify((e as { response?: { data?: unknown } })?.response?.data ?? '');
  return m.includes('invalid_grant');
}

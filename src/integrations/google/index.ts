import type { CalendarGateway } from './gateway';
import { AgendaFalsa } from './falso';
import { AgendaGoogle } from './real';
import { env } from '@/lib/env';

const g = globalThis as unknown as { __agenda?: CalendarGateway };

/** Agenda única. Em testes/desenvolvimento sem credenciais usa a agenda em memória. */
export function agenda(): CalendarGateway {
  if (!g.__agenda) {
    if (env.googleFake) {
      if (process.env.NODE_ENV !== 'test') console.warn('[google] Usando agenda FALSA em memória (sem credenciais).');
      g.__agenda = new AgendaFalsa();
    } else {
      if (!env.calendarId) throw new Error('GOOGLE_CALENDAR_ID não configurado.');
      g.__agenda = new AgendaGoogle(env.calendarId);
    }
  }
  return g.__agenda;
}

export function agendaFalsa(): AgendaFalsa {
  const a = agenda();
  if (!(a instanceof AgendaFalsa)) throw new Error('A agenda atual não é a falsa.');
  return a;
}

export * from './gateway';

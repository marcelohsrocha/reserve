import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/** Fuso fixo da igreja. */
export const FUSO = 'America/Campo_Grande';

/** Converte data (AAAA-MM-DD) e hora (HH:MM) locais em um instante UTC. */
export function localParaUtc(data: string, hora: string): Date {
  return fromZonedTime(`${data}T${hora}:00`, FUSO);
}

export function formatarLocal(d: Date, formato: string): string {
  return formatInTimeZone(d, FUSO, formato);
}

export const dataLocal = (d: Date) => formatarLocal(d, 'yyyy-MM-dd');
export const horaLocal = (d: Date) => formatarLocal(d, 'HH:mm');
export const dataHoraBR = (d: Date) => formatarLocal(d, 'dd/MM/yyyy HH:mm');
export const dataBR = (d: Date) => formatarLocal(d, 'dd/MM/yyyy');

/** Dia da semana local (0 = domingo). */
export function diaSemanaLocal(d: Date): number {
  return Number(formatarLocal(d, 'i')) % 7;
}

/** Início e fim (exclusivo) do dia local que contém `d`, em UTC. */
export function limitesDoDia(d: Date): { inicio: Date; fim: Date } {
  const dia = dataLocal(d);
  return { inicio: localParaUtc(dia, '00:00'), fim: localParaUtc(somarDias(dia, 1), '00:00') };
}

/** Soma dias a uma data AAAA-MM-DD (aritmética de calendário, sem fuso). */
export function somarDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/** Dia da semana de uma data AAAA-MM-DD (0 = domingo). */
export function diaSemanaDaData(data: string): number {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export const minutos = (n: number) => n * 60_000;

const fmtMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtMesCurto = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const fmtExtenso = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const meioDia = (data: string) => new Date(`${data}T12:00:00Z`);

const inicialMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Outubro de 2026" para AAAA-MM(-DD). */
export const nomeMes = (data: string) => inicialMaiuscula(fmtMes.format(meioDia(data.length === 7 ? `${data}-01` : data)));
export const nomeMesCurto = (data: string) => inicialMaiuscula(fmtMesCurto.format(meioDia(data.length === 7 ? `${data}-01` : data)));
/** "Sexta-feira, 30 de outubro" para AAAA-MM-DD. */
export const dataPorExtenso = (data: string) => inicialMaiuscula(fmtExtenso.format(meioDia(data)));

/** Soma meses a AAAA-MM. */
export function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

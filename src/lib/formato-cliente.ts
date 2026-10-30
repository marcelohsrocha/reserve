/** Formatação de datas no navegador, sempre no fuso da igreja. */
const FUSO = 'America/Campo_Grande';

const hora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' });
const dia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' });
const diaLongo = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: 'long' });
const chaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

export const fmtHora = (d: string | Date) => hora.format(new Date(d));
export const fmtDia = (d: string | Date) => dia.format(new Date(d));
export const fmtDiaLongo = (d: string | Date) => diaLongo.format(new Date(d));
export const mesmoDia = (a: string | Date, b: string | Date) => chaveDia.format(new Date(a)) === chaveDia.format(new Date(b));
export const hojeLocal = () => chaveDia.format(new Date());

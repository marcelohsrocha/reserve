/**
 * "Adicionar à minha agenda" sem pedir acesso à agenda pessoal do usuário:
 * link de modelo do Google Agenda (um evento) e arquivo .ics (vários eventos, abre em
 * Google Agenda, iPhone e Outlook). O usuário decide e grava ele mesmo.
 */

export interface EventoAgenda {
  uid: string;
  titulo: string;
  inicio: Date;
  fim: Date;
  local: string;
  detalhes: string;
}

/** 20301104T230000Z */
export const carimboUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function linkGoogleAgenda(e: Omit<EventoAgenda, 'uid'>): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titulo,
    dates: `${carimboUtc(e.inicio)}/${carimboUtc(e.fim)}`,
    location: e.local,
    details: e.detalhes,
    ctz: 'America/Campo_Grande',
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

const escaparIcs = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Dobra linhas em 75 bytes (RFC 5545), sem quebrar caracteres UTF-8 no meio. */
function dobrar(linha: string): string {
  const partes: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (partes.length ? 74 : 75)) {
      partes.push(atual);
      atual = '';
      bytes = 0;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join('\r\n ');
}

export function gerarIcs(eventos: EventoAgenda[], agora = new Date()): string {
  const linhas = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IPI Dourados//Reservas de Salas//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const e of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@reservas-ipi-dourados`,
      `DTSTAMP:${carimboUtc(agora)}`,
      `DTSTART:${carimboUtc(e.inicio)}`,
      `DTEND:${carimboUtc(e.fim)}`,
      `SUMMARY:${escaparIcs(e.titulo)}`,
      `LOCATION:${escaparIcs(e.local)}`,
      `DESCRIPTION:${escaparIcs(e.detalhes)}`,
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  return linhas.map(dobrar).join('\r\n') + '\r\n';
}

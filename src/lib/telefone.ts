/** Telefones são armazenados em E.164 (+55DDDNÚMERO) e nunca exibidos completos fora do admin. */

export function normalizarTelefone(entrada: string): string | null {
  let dig = entrada.replace(/\D/g, '');
  if (dig.startsWith('55') && (dig.length === 12 || dig.length === 13)) dig = dig.slice(2);
  if (dig.length !== 10 && dig.length !== 11) return null;
  if (dig.startsWith('0')) return null;
  return `+55${dig}`;
}

function partes(e164: string) {
  const dig = e164.replace(/^\+55/, '');
  return { ddd: dig.slice(0, 2), numero: dig.slice(2) };
}

/** (67) 99999-1234 — uso exclusivo do admin. */
export function formatarTelefone(e164: string): string {
  const { ddd, numero } = partes(e164);
  const corte = numero.length - 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** (67) 9****-1234 — usado em painéis, check-in e Google Agenda (LGPD). */
export function mascararTelefone(e164: string): string {
  const { ddd, numero } = partes(e164);
  const corte = numero.length - 4;
  return `(${ddd}) ${numero[0]}${'*'.repeat(corte - 1)}-${numero.slice(corte)}`;
}

export function ultimos4(e164: string): string {
  return e164.slice(-4);
}

/** "S03" a partir do número da sala. */
export function codigoSala(numero: number): string {
  return `S${String(numero).padStart(2, '0')}`;
}

export function rotuloSala(s: { numero: number; nome: string; andar: string }): string {
  return `${codigoSala(s.numero)} – ${s.nome} – ${s.andar}`;
}

/** Valor do campo `location` dos eventos no Google. */
export function locationSala(s: { numero: number; nome: string; andar: string }): string {
  return `${codigoSala(s.numero)} – ${s.nome} (${s.andar})`;
}

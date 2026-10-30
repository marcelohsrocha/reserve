import { codigoSala } from './sala';

// Aceita [S03], [S3], [s03], [ S 3 ] no início do título.
const PREFIXO = /^\s*\[\s*s\s*0*(\d{1,4})\s*\]\s*/i;

/** Lê o número da sala do prefixo [Snn] do título; null se não houver. */
export function lerPrefixo(titulo: string | null | undefined): number | null {
  const m = PREFIXO.exec(titulo ?? '');
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/** Remove o prefixo [Snn] (se houver) e devolve o restante do título. */
export function semPrefixo(titulo: string): string {
  return titulo.replace(PREFIXO, '').trim();
}

/** Título padronizado: "[S03] Reunião de diáconos". */
export function tituloPadronizado(numero: number, titulo: string): string {
  const resto = semPrefixo(titulo);
  return resto ? `[${codigoSala(numero)}] ${resto}` : `[${codigoSala(numero)}]`;
}

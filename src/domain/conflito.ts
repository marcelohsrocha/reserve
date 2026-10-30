import type { Intervalo } from './ocorrencias';

/** Algo que ocupa uma sala num intervalo (reserva local, bloqueio ou evento do Google). */
export interface Ocupacao extends Intervalo {
  salaNumero: number;
  titulo: string;
  origem: 'reserva' | 'bloqueio' | 'google';
  ocorrenciaId?: string | null;
  bloqueioId?: string | null;
  googleEventId?: string | null;
}

export interface Conflito {
  pedido: Intervalo;
  com: Ocupacao;
}

export const sobrepoe = (a: Intervalo, b: Intervalo) => a.inicio < b.fim && b.inicio < a.fim;

/**
 * Cruza os intervalos pedidos para uma sala com tudo que já ocupa a agenda única.
 * Só considera ocupações da MESMA sala; salas diferentes nunca conflitam.
 */
export function encontrarConflitos(salaNumero: number, pedidos: Intervalo[], ocupacoes: Ocupacao[]): Conflito[] {
  const daSala = ocupacoes.filter((o) => o.salaNumero === salaNumero);
  const res: Conflito[] = [];
  for (const pedido of pedidos) {
    for (const com of daSala) if (sobrepoe(pedido, com)) res.push({ pedido, com });
  }
  return res;
}

/**
 * Remove duplicatas: uma ocorrência local e seu espelho no Google são a mesma ocupação.
 */
export function deduplicarOcupacoes(lista: Ocupacao[]): Ocupacao[] {
  const vistos = new Set<string>();
  const res: Ocupacao[] = [];
  for (const o of lista) {
    const chave = o.ocorrenciaId ? `o:${o.ocorrenciaId}` : o.bloqueioId ? `b:${o.bloqueioId}` : `g:${o.googleEventId}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    res.push(o);
  }
  return res;
}

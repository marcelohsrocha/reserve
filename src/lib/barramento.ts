import { EventEmitter } from 'node:events';

/** Tipos de evento enviados aos painéis por SSE. */
export type TopicoAtualizacao = 'salas' | 'reservas' | 'status' | 'bloqueios' | 'google' | 'checkin' | 'tick';

export interface Atualizacao {
  topico: TopicoAtualizacao;
  em: string;
  dados?: Record<string, unknown>;
}

const g = globalThis as unknown as { __barramento?: EventEmitter };
const emissor = g.__barramento ?? new EventEmitter();
emissor.setMaxListeners(500);
g.__barramento = emissor;

export function publicar(topico: TopicoAtualizacao, dados?: Record<string, unknown>) {
  const msg: Atualizacao = { topico, em: new Date().toISOString(), dados };
  emissor.emit('atualizacao', msg);
}

export function assinar(fn: (a: Atualizacao) => void): () => void {
  emissor.on('atualizacao', fn);
  return () => emissor.off('atualizacao', fn);
}

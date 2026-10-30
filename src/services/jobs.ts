import { env } from '@/lib/env';
import { atualizarStatus } from './status';
import { garantirObservacao, sincronizar } from './sincronizacao';

const g = globalThis as unknown as { __jobsIniciados?: boolean };

/** Evita execuções sobrepostas de um mesmo job. */
function protegido(nome: string, fn: () => Promise<unknown>) {
  let rodando = false;
  return async () => {
    if (rodando) return;
    rodando = true;
    try {
      await fn();
    } catch (e) {
      console.error(`[job:${nome}]`, e);
    } finally {
      rodando = false;
    }
  };
}

export function iniciarJobs() {
  if (g.__jobsIniciados || env.jobsDesligados) return;
  g.__jobsIniciados = true;

  const status = protegido('status', () => atualizarStatus());
  const sync = protegido('sync', () => sincronizar());
  const watch = protegido('watch', () => garantirObservacao());

  // Status: alinhado à virada do minuto (+1 s), para a sala ficar livre no minuto exato do fim.
  const atraso = 61_000 - (Date.now() % 60_000);
  setTimeout(() => {
    status();
    setInterval(status, 60_000);
  }, atraso);
  status();

  // Sync inicial + fallback de polling a cada 2 minutos (o webhook acelera quando disponível).
  sync().then(watch);
  setInterval(sync, 2 * 60_000);
  setInterval(watch, 60 * 60_000);

  console.log('[jobs] status (1 min), sync Google (2 min) e renovação do watch (1 h) iniciados.');
}

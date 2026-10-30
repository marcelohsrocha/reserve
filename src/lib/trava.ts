/** Serializa operações por chave (ex.: por sala) dentro do processo. */
const filas = new Map<string, Promise<unknown>>();

export async function comTrava<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const anterior = filas.get(chave) ?? Promise.resolve();
  let liberar!: () => void;
  const atual = new Promise<void>((r) => (liberar = r));
  const encadeada = anterior.then(() => atual);
  filas.set(chave, encadeada);
  await anterior.catch(() => undefined);
  try {
    return await fn();
  } finally {
    liberar();
    if (filas.get(chave) === encadeada) filas.delete(chave);
  }
}

/** Executa tarefas com concorrência limitada, preservando a ordem dos resultados. */
export async function emParalelo<T, R>(itens: T[], limite: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const res: R[] = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++;
      res[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return res;
}

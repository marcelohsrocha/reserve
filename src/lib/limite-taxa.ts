/** Rate limit em memória: no máximo `max` tentativas por chave dentro da janela. */
const tentativas = new Map<string, number[]>();

export function registrarTentativa(chave: string, max = 5, janelaMs = 10 * 60_000, agora = Date.now()): boolean {
  const lista = (tentativas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (lista.length >= max) {
    tentativas.set(chave, lista);
    return false;
  }
  lista.push(agora);
  tentativas.set(chave, lista);
  return true;
}

export function limparTentativas() {
  tentativas.clear();
}

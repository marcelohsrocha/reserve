import { headers } from 'next/headers';

/** Cabeçalho preenchido pelo middleware depois de validar o JWT do Cloudflare Access. */
export const CABECALHO_USUARIO = 'x-usuario-email';

export async function usuarioAtual(): Promise<string> {
  const h = await headers();
  return h.get(CABECALHO_USUARIO) || 'desconhecido';
}

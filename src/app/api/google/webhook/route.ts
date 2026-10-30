import { timingSafeEqual } from 'node:crypto';
import { env } from '@/lib/env';
import { agendarSincronizacao } from '@/services/sincronizacao';

export const dynamic = 'force-dynamic';

function tokenValido(recebido: string | null) {
  const esperado = env.webhookToken;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Notificação do canal events.watch. Rota pública (bypass no Access), validada pelo token do canal. */
export async function POST(req: Request) {
  if (!tokenValido(req.headers.get('x-goog-channel-token'))) return new Response('token inválido', { status: 401 });
  // "sync" é a mensagem inicial de criação do canal; qualquer outra indica mudança na agenda.
  if (req.headers.get('x-goog-resource-state') !== 'sync') agendarSincronizacao();
  return new Response(null, { status: 204 });
}

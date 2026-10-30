import { assinar } from '@/lib/barramento';

export const dynamic = 'force-dynamic';

/** Server-Sent Events: avisa os painéis sempre que algo muda. Heartbeat evita o corte do Cloudflare (100 s). */
export async function GET(req: Request) {
  const codificador = new TextEncoder();
  let cancelar = () => {};
  const stream = new ReadableStream({
    start(controller) {
      const enviar = (texto: string) => {
        try {
          controller.enqueue(codificador.encode(texto));
        } catch {
          cancelar();
        }
      };
      enviar('retry: 3000\n\n');
      const desassinar = assinar((a) => enviar(`event: atualizacao\ndata: ${JSON.stringify(a)}\n\n`));
      const batimento = setInterval(() => enviar(': ping\n\n'), 20_000);
      cancelar = () => {
        clearInterval(batimento);
        desassinar();
      };
      req.signal.addEventListener('abort', () => {
        cancelar();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cancelar();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

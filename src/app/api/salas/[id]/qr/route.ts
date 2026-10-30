import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { codigoSala } from '@/domain/sala';

export const dynamic = 'force-dynamic';

/** PNG do QR Code da sala (?formato=svg para vetor). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sala = await db.sala.findUnique({ where: { id } });
  if (!sala?.ativa) return new Response('Sala não encontrada', { status: 404 });
  const url = `${env.publicBaseUrl}/checkin/${sala.qrToken}`;
  const nome = `qr-${codigoSala(sala.numero)}`;
  if (new URL(req.url).searchParams.get('formato') === 'svg') {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml', 'Content-Disposition': `inline; filename="${nome}.svg"` } });
  }
  const png = await QRCode.toBuffer(url, { type: 'png', margin: 2, width: 1024, errorCorrectionLevel: 'M' });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="${nome}.png"` } });
}

import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { codigoSala } from '@/domain/sala';
import { BotaoImprimir } from './BotaoImprimir';

/** Folhas A5 prontas para impressão: logo, código em destaque, nome, andar, QR e instrução. */
export default async function Imprimir({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const salas = await db.sala.findMany({
    where: { ativa: true, ...(ids && { id: { in: ids.split(',') } }) },
    orderBy: { numero: 'asc' },
  });
  const qrs = await Promise.all(
    salas.map((s) => QRCode.toString(`${env.publicBaseUrl}/checkin/${s.qrToken}`, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })),
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-slate-600">{salas.length} folha(s) A5. Use “Retrato” e margens “Nenhuma” na impressão.</p>
        <BotaoImprimir />
      </div>
      {salas.map((s, i) => (
        <section
          key={s.id}
          className="mx-auto flex h-[210mm] w-[148mm] flex-col items-center justify-between break-after-page border border-dashed border-slate-300 bg-white p-[10mm] text-center print:border-0"
        >
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="" className="h-[18mm] w-[18mm]" />
            <div className="text-left text-[11pt] font-semibold leading-tight text-slate-700">
              Igreja Presbiteriana
              <br />
              Independente de Dourados
            </div>
          </div>
          <div>
            <div className="text-[64pt] font-black leading-none tracking-tight text-igreja">{codigoSala(s.numero)}</div>
            <div className="mt-2 text-[20pt] font-bold leading-tight">{s.nome}</div>
            <div className="text-[13pt] text-slate-600">{s.andar}</div>
          </div>
          <div className="w-[85mm]" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
          <div className="text-[15pt] font-semibold">Escaneie para confirmar sua presença</div>
        </section>
      ))}
    </div>
  );
}

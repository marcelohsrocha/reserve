import Link from 'next/link';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { codigoSala } from '@/domain/sala';
import { FormAcao } from '@/components/FormAcao';
import { acaoRegenerarQr } from '../acoes';
import { exigirAdmin } from '@/lib/usuario';

export default async function QrCodes() {
  await exigirAdmin();
  const salas = await db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } });
  const qrs = await Promise.all(salas.map((s) => QRCode.toString(`${env.publicBaseUrl}/checkin/${s.qrToken}`, { type: 'svg', margin: 1 })));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina mb-0">QR Codes</h1>
        {salas.length > 0 && <Link href="/admin/qrcodes/imprimir" target="_blank" className="btn-primario">Imprimir todos</Link>}
      </div>
      <p className="text-sm text-slate-600">
        Cada QR aponta para <code>{env.publicBaseUrl}/checkin/…</code>. Confira se esse é o endereço público do túnel (variável PUBLIC_BASE_URL).
      </p>
      {salas.length === 0 && <p className="cartao">Nenhuma sala ativa.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {salas.map((s, i) => (
          <div key={s.id} className="cartao space-y-2 text-center">
            <div className="text-2xl font-black">{codigoSala(s.numero)}</div>
            <div className="text-sm">{s.nome}</div>
            <div className="mx-auto w-32" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
            <div className="flex flex-wrap justify-center gap-1">
              <Link href={`/admin/qrcodes/imprimir?ids=${s.id}`} target="_blank" className="btn-secundario">Gerar/Imprimir</Link>
              <FormAcao inline acao={acaoRegenerarQr} botao="Regenerar" classeBotao="btn-secundario" confirmar={`O QR atual da ${codigoSala(s.numero)} vai parar de funcionar. Continuar?`}>
                <input type="hidden" name="id" value={s.id} />
              </FormAcao>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

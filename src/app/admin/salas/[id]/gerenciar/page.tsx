import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { dataHoraBR, horaLocal, dataBR } from '@/lib/tempo';
import { codigoSala } from '@/domain/sala';
import { impactoDesativacao } from '@/services/salas';
import { andaresUsados } from '@/services/configuracao';
import { FormAcao } from '@/components/FormAcao';
import { ResolucaoCampos } from '@/components/ResolucaoCampos';
import {
  acaoBloquear,
  acaoDesativarSala,
  acaoEditarSala,
  acaoExcluirSala,
  acaoReativarSala,
  acaoRegenerarQr,
  acaoRemoverBloqueio,
} from '../../../acoes';

export default async function GerenciarSala({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sala = await db.sala.findUnique({
    where: { id },
    include: { _count: { select: { reservas: true, ocorrencias: true, bloqueios: true } } },
  });
  if (!sala) notFound();
  const agora = new Date();
  const [futuras, bloqueios, destinos, andares] = await Promise.all([
    impactoDesativacao(id, agora),
    db.bloqueio.findMany({ where: { salaId: id, ativo: true, fimUtc: { gt: agora } }, orderBy: { inicioUtc: 'asc' } }),
    db.sala.findMany({ where: { ativa: true, id: { not: id } }, orderBy: { numero: 'asc' } }),
    andaresUsados(),
  ]);
  const codigo = codigoSala(sala.numero);
  const temHistorico = sala._count.reservas + sala._count.ocorrencias + sala._count.bloqueios > 0;
  const qrSvg = sala.ativa
    ? await QRCode.toString(`${env.publicBaseUrl}/checkin/${sala.qrToken}`, { type: 'svg', margin: 1 })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina mb-0">
          {codigo} – {sala.nome}{' '}
          {!sala.ativa && <span className="etiqueta bg-slate-200 align-middle text-slate-700">Desativada</span>}
        </h1>
        <Link href={`/admin/salas/${sala.id}`} className="btn-secundario">← Agenda da sala</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao">
          <h2 className="mb-3 font-semibold">Dados da sala</h2>
          <FormAcao acao={acaoEditarSala} botao="Salvar alterações">
            <input type="hidden" name="id" value={sala.id} />
            <div>
              <label className="rotulo">Número</label>
              <input name="numero" type="number" min={1} defaultValue={sala.numero} required className="campo" />
              <p className="mt-1 text-xs text-slate-500">Só pode mudar se a sala não tiver reservas, bloqueios ou eventos futuros.</p>
            </div>
            <div>
              <label className="rotulo">Nome</label>
              <input name="nome" defaultValue={sala.nome} required className="campo" />
            </div>
            <div>
              <label className="rotulo">Andar</label>
              <input name="andar" list="andares" defaultValue={sala.andar} required className="campo" />
              <datalist id="andares">{andares.map((a) => <option key={a} value={a} />)}</datalist>
            </div>
          </FormAcao>
        </section>

        {sala.ativa && qrSvg && (
          <section className="cartao space-y-3">
            <h2 className="font-semibold">QR Code de check-in</h2>
            <div className="mx-auto w-48" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/admin/qrcodes/imprimir?ids=${sala.id}`} className="btn-primario" target="_blank">Gerar/Imprimir (A5)</Link>
              <a href={`/api/salas/${sala.id}/qr`} className="btn-secundario" download>Baixar PNG</a>
              <FormAcao inline acao={acaoRegenerarQr} botao="Regenerar QR" classeBotao="btn-secundario" confirmar="O QR atual (colado na porta) vai parar de funcionar. Continuar?">
                <input type="hidden" name="id" value={sala.id} />
              </FormAcao>
            </div>
          </section>
        )}
      </div>

      {sala.ativa && (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Bloquear por período</h2>
          <p className="text-sm text-slate-600">Indisponibilidade temporária (ex.: reforma). Cria o evento “[{codigo}] BLOQUEADA – motivo” no Google e impede reservas no intervalo.</p>
          <FormAcao acao={acaoBloquear} botao="Bloquear sala">
            <input type="hidden" name="id" value={sala.id} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="rotulo">Início</label>
                <input type="datetime-local" name="inicio" required className="campo" />
              </div>
              <div>
                <label className="rotulo">Fim</label>
                <input type="datetime-local" name="fim" required className="campo" />
              </div>
              <div>
                <label className="rotulo">Motivo</label>
                <input name="motivo" required maxLength={80} className="campo" placeholder="Reforma" />
              </div>
            </div>
            <ResolucaoCampos destinos={destinos} obrigatorio={false} />
          </FormAcao>
          {bloqueios.length > 0 && (
            <ul className="divide-y divide-slate-100 text-sm">
              {bloqueios.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    <strong>{b.motivo}</strong> · {dataHoraBR(b.inicioUtc)} → {dataHoraBR(b.fimUtc)}
                  </span>
                  <FormAcao inline acao={acaoRemoverBloqueio} botao="Remover" classeBotao="btn-secundario" confirmar="Remover este bloqueio?">
                    <input type="hidden" name="id" value={b.id} />
                  </FormAcao>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {sala.ativa ? (
        <section className="cartao space-y-3 border-red-200">
          <h2 className="font-semibold text-red-800">Desativar sala</h2>
          <p className="text-sm text-slate-600">
            A sala some dos painéis e do formulário de reserva, o QR deixa de funcionar e o histórico é mantido. O número {codigo} nunca será reaproveitado.
          </p>
          {futuras.length > 0 ? (
            <>
              <p className="text-sm font-medium">Esta sala tem {futuras.length} reserva(s) futura(s). Escolha o que fazer antes de concluir:</p>
              <ul className="max-h-48 overflow-y-auto rounded border border-slate-100 text-sm">
                {futuras.map((o) => (
                  <li key={o.id} className="border-b border-slate-100 px-2 py-1">
                    {dataBR(o.inicioUtc)} {horaLocal(o.inicioUtc)}–{horaLocal(o.fimUtc)} · {o.reserva.titulo} ({o.reserva.pessoa.nome})
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm">Sem reservas futuras.</p>
          )}
          <FormAcao acao={acaoDesativarSala} botao="Desativar sala" classeBotao="btn-perigo" confirmar={`Desativar a ${codigo}?`}>
            <input type="hidden" name="id" value={sala.id} />
            {futuras.length > 0 && <ResolucaoCampos destinos={destinos} obrigatorio />}
          </FormAcao>
        </section>
      ) : (
        <section className="cartao space-y-3">
          <h2 className="font-semibold">Reativar sala</h2>
          <p className="text-sm text-slate-600">Mantém o número {codigo} e gera um NOVO QR Code (o antigo continua inválido).</p>
          <FormAcao acao={acaoReativarSala} botao="Reativar sala">
            <input type="hidden" name="id" value={sala.id} />
          </FormAcao>
        </section>
      )}

      {!temHistorico && (
        <section className="cartao space-y-2">
          <h2 className="font-semibold">Excluir definitivamente</h2>
          <p className="text-sm text-slate-600">Permitido apenas porque esta sala não tem nenhuma reserva ou bloqueio no histórico.</p>
          <FormAcao acao={acaoExcluirSala} botao="Excluir sala" classeBotao="btn-perigo" confirmar="Excluir definitivamente? O número não poderá ser reutilizado.">
            <input type="hidden" name="id" value={sala.id} />
          </FormAcao>
        </section>
      )}
    </div>
  );
}

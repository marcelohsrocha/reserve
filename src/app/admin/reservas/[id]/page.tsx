import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/usuario';
import { dataBR, dataLocal, horaLocal, DIAS_SEMANA, diaSemanaLocal, dataHoraBR } from '@/lib/tempo';
import { formatarTelefone, mascararTelefone } from '@/lib/telefone';
import { codigoSala, rotuloSala } from '@/domain/sala';
import { ROTULO_STATUS, STATUS_ATIVOS, type StatusOcorrencia } from '@/domain/status';
import { parseDiasSemana } from '@/domain/ocorrencias';
import { FormAcao } from '@/components/FormAcao';
import { acaoCancelarOcorrencia, acaoCancelarReserva, acaoEditarReserva, acaoRemarcarOcorrencia, acaoTransferirReserva } from '../../acoes';

export default async function Reserva({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criada?: string }> }) {
  const { id } = await params;
  const { criada } = await searchParams;
  const reserva = await db.reserva.findUnique({
    where: { id },
    include: { sala: true, pessoa: true, ocorrencias: { include: { sala: true }, orderBy: { inicioUtc: 'asc' } } },
  });
  const u = await exigirUsuario();
  if (!reserva || (!u.admin && reserva.pessoaId !== u.id)) notFound();
  const [pessoas, salas] = await Promise.all([
    u.admin ? db.pessoa.findMany({ where: { ativo: true, email: { not: null } }, orderBy: { nome: 'asc' } }) : [],
    db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } }),
  ]);
  const agora = new Date();
  const ativas = reserva.ocorrencias.filter((o) => STATUS_ATIVOS.includes(o.status as StatusOcorrencia) && o.fimUtc > agora);
  const dias = parseDiasSemana(reserva.diasSemana);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina mb-0">{reserva.titulo}</h1>
        <Link href="/admin/reservas" className="btn-secundario">← Reservas</Link>
      </div>
      {criada && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
          Reserva criada na agenda do sistema{reserva.pessoa.googleRefreshToken ? ` e na Agenda Google de ${reserva.pessoa.nome}` : ''}.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="cartao space-y-1 text-sm">
          <p><strong>Sala:</strong> {rotuloSala(reserva.sala)}{!reserva.sala.ativa && ' (desativada)'}</p>
          <p><strong>Responsável:</strong> {reserva.pessoa.nome} · {u.admin ? formatarTelefone(reserva.pessoa.telefoneE164) : mascararTelefone(reserva.pessoa.telefoneE164)}</p>
          <p><strong>Período:</strong> {reserva.dataInicio.split('-').reverse().join('/')} a {reserva.dataFim.split('-').reverse().join('/')}, das {reserva.horaInicio} às {reserva.horaFim}</p>
          {dias && <p><strong>Dias:</strong> {dias.map((d) => DIAS_SEMANA[d]).join(', ')}</p>}
          <p><strong>Criada por:</strong> {reserva.criadoPor} em {dataHoraBR(reserva.criadaEm)}</p>
        </section>

        <section className="cartao">
          <h2 className="mb-3 font-semibold">Editar</h2>
          <FormAcao acao={acaoEditarReserva} botao="Salvar">
            <input type="hidden" name="id" value={reserva.id} />
            <input name="titulo" defaultValue={reserva.titulo} required className="campo" />
            {u.admin && (
              <select name="pessoaId" defaultValue={reserva.pessoaId} className="campo">
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}
          </FormAcao>
        </section>
      </div>

      {ativas.length > 0 && (
        <section className="cartao grid gap-4 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 font-semibold">Transferir ocorrências futuras</h2>
            <FormAcao acao={acaoTransferirReserva} botao="Transferir">
              <input type="hidden" name="id" value={reserva.id} />
              <select name="destinoId" required className="campo" defaultValue="">
                <option value="" disabled>Sala de destino…</option>
                {salas.filter((s) => s.id !== reserva.salaId).map((s) => <option key={s.id} value={s.id}>{rotuloSala(s)}</option>)}
              </select>
            </FormAcao>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Cancelar</h2>
            <FormAcao acao={acaoCancelarReserva} botao={`Cancelar ${ativas.length} ocorrência(s) futura(s)`} classeBotao="btn-perigo" confirmar="Cancelar todas as ocorrências futuras desta reserva?">
              <input type="hidden" name="id" value={reserva.id} />
            </FormAcao>
          </div>
        </section>
      )}

      <section className="cartao p-0">
        <h2 className="border-b border-slate-100 px-4 py-2 font-semibold">Ocorrências ({reserva.ocorrencias.length})</h2>
        <ul className="divide-y divide-slate-100">
          {reserva.ocorrencias.map((o) => {
            const ativa = STATUS_ATIVOS.includes(o.status as StatusOcorrencia) && o.fimUtc > agora;
            return (
              <li key={o.id} className="px-4 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {DIAS_SEMANA[diaSemanaLocal(o.inicioUtc)]} {dataBR(o.inicioUtc)} · {horaLocal(o.inicioUtc)}–{horaLocal(o.fimUtc)} · <strong>{codigoSala(o.sala.numero)}</strong>
                    {o.checkinEm && <span className="text-slate-500"> · check-in {horaLocal(o.checkinEm)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="etiqueta bg-slate-100">{ROTULO_STATUS[o.status as StatusOcorrencia]}</span>
                    {ativa && (
                      <FormAcao inline acao={acaoCancelarOcorrencia} botao="Cancelar" classeBotao="btn-secundario" confirmar="Cancelar esta ocorrência?">
                        <input type="hidden" name="id" value={o.id} />
                      </FormAcao>
                    )}
                  </span>
                </div>
                {ativa && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-igreja">Remarcar</summary>
                    <FormAcao acao={acaoRemarcarOcorrencia} botao="Remarcar" className="mt-2">
                      <input type="hidden" name="id" value={o.id} />
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <input type="date" name="data" required defaultValue={dataLocal(o.inicioUtc)} className="campo" />
                        <input type="time" name="horaInicio" required defaultValue={horaLocal(o.inicioUtc)} className="campo" />
                        <input type="time" name="horaFim" required defaultValue={horaLocal(o.fimUtc)} className="campo" />
                        <select name="salaId" defaultValue={o.salaId} className="campo">
                          {salas.map((s) => <option key={s.id} value={s.id}>{codigoSala(s.numero)} – {s.nome}</option>)}
                        </select>
                      </div>
                    </FormAcao>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import {
  DATA_VALIDA,
  DIAS_SEMANA,
  dataBR,
  dataLocal,
  dataPorExtenso,
  diaSemanaDaData,
  horaLocal,
  localParaUtc,
  nomeMesCurto,
  somarDias,
  somarMeses,
} from '@/lib/tempo';
import { codigoSala } from '@/domain/sala';
import { STATUS_ATIVOS, STATUS_TERMINAIS, type StatusOcorrencia } from '@/domain/status';
import { obterPainel } from '@/services/painel';
import { doDia, itensAgenda, type ItemAgenda } from '@/services/agenda';
import { AtualizacaoAoVivo } from '@/components/AtualizacaoAoVivo';
import { StatusOcorrenciaPill, StatusSala } from '@/components/Status';
import { FormAcao } from '@/components/FormAcao';
import { IconeAjustes, IconeAvancar, IconeCalendario, IconeCheck, IconeMais, IconePessoa, IconeRelogio, IconeVoltar } from '@/components/icones';
import { acaoCancelarOcorrencia, acaoLiberarSala } from '../../acoes';
import { MesSeletor } from './MesSeletor';

const DIA_MS = 86_400_000;

type Fase = 'passado' | 'agora' | 'futuro';
function faseDo(i: ItemAgenda, agora: Date): Fase {
  if (i.fim <= agora || (i.status && STATUS_TERMINAIS.includes(i.status as StatusOcorrencia))) return 'passado';
  if (i.inicio <= agora) return 'agora';
  return 'futuro';
}

export default async function AgendaDaSala({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ dia?: string; criada?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const sala = await db.sala.findUnique({ where: { id } });
  if (!sala) notFound();

  const agora = new Date();
  const hoje = dataLocal(agora);
  const dia = sp.dia && DATA_VALIDA.test(sp.dia) ? sp.dia : hoje;
  const inicioFaixa = somarDias(dia, -diaSemanaDaData(dia)); // domingo da semana do dia escolhido
  const faixa = Array.from({ length: 14 }, (_, i) => somarDias(inicioFaixa, i));
  const base = `/admin/salas/${sala.id}`;

  const [itensFaixa, futuros, painel, faltas90, itensHoje] = await Promise.all([
    itensAgenda(localParaUtc(inicioFaixa, '00:00'), localParaUtc(somarDias(inicioFaixa, 14), '00:00'), sala.id),
    itensAgenda(agora, new Date(agora.getTime() + 60 * DIA_MS), sala.id),
    obterPainel(agora),
    db.ocorrencia.count({ where: { salaId: sala.id, status: 'NAO_COMPARECEU', inicioUtc: { gte: new Date(agora.getTime() - 90 * DIA_MS) } } }),
    itensAgenda(localParaUtc(hoje, '00:00'), localParaUtc(somarDias(hoje, 1), '00:00'), sala.id),
  ]);
  const card = painel.andares.flatMap((a) => a.salas).find((s) => s.id === sala.id);
  const doDiaSel = doDia(itensFaixa, dia);
  const proximos = futuros.filter((i) => faseDo(i, agora) !== 'passado').slice(0, 6);
  const horasSemana =
    Math.round(
      itensFaixa
        .filter((i) => i.tipo !== 'bloqueio' && i.status !== 'NAO_COMPARECEU' && i.inicio < localParaUtc(somarDias(inicioFaixa, 7), '00:00'))
        .reduce((t, i) => t + (i.fim.getTime() - i.inicio.getTime()) / 3_600_000, 0) * 10,
    ) / 10;

  const meses = Array.from({ length: 12 }, (_, k) => somarMeses(hoje.slice(0, 7), k - 2)).map((m) => ({ mes: m, rotulo: nomeMesCurto(m) }));
  if (!meses.some((m) => m.mes === dia.slice(0, 7))) meses.push({ mes: dia.slice(0, 7), rotulo: nomeMesCurto(dia) });
  const linkReservar = `/admin/reservas/nova?salaId=${sala.id}&data=${dia < hoje ? hoje : dia}`;

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <AtualizacaoAoVivo />

      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin" className="btn-icone shrink-0" aria-label="Voltar"><IconeVoltar className="h-5 w-5" /></Link>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold tracking-tight sm:text-2xl">
              {codigoSala(sala.numero)} · {sala.nome}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {sala.andar}
              {card ? <StatusSala estado={card.estado} /> : <span className="etiqueta bg-slate-200 text-slate-600">Desativada</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link href={`${base}/gerenciar`} className="btn-icone" aria-label="Gerenciar sala" title="Gerenciar sala (editar, QR, bloquear, desativar)">
            <IconeAjustes className="h-5 w-5" />
          </Link>
          {sala.ativa && (
            <Link href={linkReservar} className="btn-primario hidden lg:inline-flex"><IconeMais className="h-4 w-4" /> Reservar</Link>
          )}
        </div>
      </div>

      {sp.criada && (
        <p className="rounded-2xl bg-igreja-claro px-4 py-3 text-sm text-igreja">Sala cadastrada! Ela já aparece nos painéis e no formulário de reserva.</p>
      )}
      {!sala.ativa && (
        <p className="rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
          Esta sala está desativada: só o histórico é exibido. <Link href={`${base}/gerenciar`} className="font-medium underline">Reativar</Link>
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Faixa de duas semanas */}
          <section className="cartao">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h2 className="whitespace-nowrap font-bold">Agenda</h2>
              <div className="flex items-center gap-1">
                <Link href={`${base}?dia=${somarDias(dia, -7)}`} scroll={false} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Semana anterior">
                  <IconeVoltar className="h-4 w-4" />
                </Link>
                <MesSeletor valor={dia.slice(0, 7)} opcoes={meses} base={base} />
                <Link href={`${base}?dia=${somarDias(dia, 7)}`} scroll={false} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Próxima semana">
                  <IconeAvancar className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
              {DIAS_SEMANA.map((d) => <div key={d} className="text-xs text-slate-400">{d}</div>)}
              {faixa.map((d) => {
                const sel = d === dia;
                const n = doDia(itensFaixa, d).length;
                return (
                  <Link
                    key={d}
                    href={`${base}?dia=${d}`}
                    scroll={false}
                    aria-current={sel ? 'date' : undefined}
                    className={`mx-auto flex h-14 w-11 flex-col items-center justify-center rounded-full transition sm:w-12 ${
                      sel ? 'bg-igreja-vivo text-white' : 'hover:bg-igreja-claro'
                    }`}
                  >
                    <span className={`text-base ${sel ? 'font-bold' : d === hoje ? 'font-bold text-igreja' : d < hoje ? 'text-slate-400' : ''}`}>{Number(d.slice(8))}</span>
                    <span className={`mt-0.5 h-1 w-1 rounded-full ${n ? (sel ? 'bg-white' : 'bg-igreja-vivo') : 'bg-transparent'}`} />
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Linha do tempo do dia */}
          <section className="cartao">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="font-bold">{dia === hoje ? 'Hoje' : dataPorExtenso(dia)}</h2>
                <p className="subtitulo">{doDiaSel.length ? `${doDiaSel.length} agendamento(s)` : 'Sala livre o dia todo'}</p>
              </div>
              {dia === hoje ? null : (
                <Link href={base} scroll={false} className="text-sm text-igreja hover:underline">Ir para hoje</Link>
              )}
            </div>

            {doDiaSel.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Nenhum agendamento neste dia.
                {sala.ativa && dia >= hoje && (
                  <div className="mt-3"><Link href={linkReservar} className="btn-primario"><IconeMais className="h-4 w-4" /> Reservar este dia</Link></div>
                )}
              </div>
            ) : (
              <ol className="relative">
                {doDiaSel.map((i, idx) => (
                  <ItemLinhaDoTempo key={i.chave} item={i} agora={agora} ultimo={idx === doDiaSel.length - 1} salaId={sala.id} />
                ))}
              </ol>
            )}
          </section>
        </div>

        {/* Coluna lateral: visão geral e próximos eventos */}
        <aside className="space-y-5">
          <section className="grid grid-cols-3 gap-2">
            <Resumo valor={itensHoje.filter((i) => i.tipo !== 'bloqueio').length} rotulo="hoje" />
            <Resumo valor={`${horasSemana.toLocaleString('pt-BR')}h`} rotulo="na semana" />
            <Resumo valor={faltas90} rotulo="faltas 90d" alerta={faltas90 > 0} />
          </section>

          <section className="cartao">
            <h2 className="mb-3 font-bold">Próximos eventos</h2>
            {proximos.length === 0 ? (
              <p className="text-sm text-slate-500">Nada agendado nos próximos 60 dias.</p>
            ) : (
              <ul className="space-y-1">
                {proximos.map((i) => {
                  const d = dataLocal(i.inicio);
                  return (
                    <li key={i.chave}>
                      <Link href={`${base}?dia=${d}`} scroll={false} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-slate-50">
                        <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-igreja-claro text-igreja">
                          <span className="text-[10px] font-semibold uppercase leading-none">{DIAS_SEMANA[diaSemanaDaData(d)]}</span>
                          <span className="text-base font-bold leading-tight">{Number(d.slice(8))}</span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold">{i.titulo}</span>
                          <span className="block text-xs text-slate-500">{horaLocal(i.inicio)}–{horaLocal(i.fim)}{i.responsavel && ` · ${i.responsavel}`}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* Botão flutuante "+" (celular), como no layout de referência */}
      {sala.ativa && (
        <Link
          href={linkReservar}
          aria-label="Nova reserva nesta sala"
          className="fixed bottom-5 left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-xl lg:hidden"
        >
          <IconeMais className="h-7 w-7" />
        </Link>
      )}
    </div>
  );
}

function Resumo({ valor, rotulo, alerta }: { valor: string | number; rotulo: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl bg-white p-3 text-center shadow-suave">
      <div className={`text-xl font-bold tabular-nums ${alerta ? 'text-orange-600' : ''}`}>{valor}</div>
      <div className="text-xs text-slate-500">{rotulo}</div>
    </div>
  );
}

function ItemLinhaDoTempo({ item: i, agora, ultimo, salaId }: { item: ItemAgenda; agora: Date; ultimo: boolean; salaId: string }) {
  const fase = faseDo(i, agora);
  const progresso = fase === 'agora' ? Math.min(100, ((agora.getTime() - i.inicio.getTime()) / (i.fim.getTime() - i.inicio.getTime())) * 100) : 0;
  const ativa = i.tipo === 'reserva' && i.status && STATUS_ATIVOS.includes(i.status as StatusOcorrencia);
  const apagado = fase === 'passado';

  return (
    <li className={`relative grid grid-cols-[3.75rem_2rem_minmax(0,1fr)] gap-x-2 rounded-2xl py-3 ${fase === 'agora' ? 'bg-gradient-to-b from-white via-igreja-claro to-igreja-claro/30' : ''}`}>
      <div className={`pt-0.5 text-right text-xs tabular-nums ${fase === 'agora' ? 'font-bold text-slate-900' : 'text-slate-400'}`}>{horaLocal(i.inicio)}</div>

      {/* Coluna do marcador, com a linha vertical ligando os itens */}
      <div className="relative flex justify-center">
        {!ultimo && <span className="absolute left-1/2 top-7 h-[calc(100%+0.25rem)] w-px -translate-x-1/2 bg-slate-200" />}
        {fase === 'passado' ? (
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-400"><IconeCheck className="h-4 w-4" /></span>
        ) : fase === 'agora' ? (
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-igreja-vivo bg-white"><span className="h-3 w-3 rounded-full bg-igreja-vivo" /></span>
        ) : (
          <span className="relative flex h-7 w-7 items-center justify-center rounded-full border border-igreja-borda bg-white"><span className="h-3 w-3 rounded-full bg-igreja-borda" /></span>
        )}
      </div>

      <div className="min-w-0 pr-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className={`text-base font-bold ${apagado ? 'text-slate-400' : fase === 'agora' ? 'text-slate-900' : 'text-slate-700'}`}>{i.titulo}</h3>
          {i.status ? <StatusOcorrenciaPill status={i.status} /> : i.tipo === 'google' ? <span className="etiqueta bg-slate-100 text-slate-500">Google Agenda</span> : null}
        </div>
        <ul className={`mt-1 space-y-0.5 text-sm ${apagado ? 'text-slate-400' : 'text-slate-600'}`}>
          {i.responsavel && <li className="flex items-center gap-2"><IconePessoa className="h-4 w-4 text-igreja-vivo" />{i.responsavel}</li>}
          <li className="flex items-center gap-2"><IconeCalendario className="h-4 w-4 text-igreja-vivo" />{dataBR(i.inicio)}</li>
          <li className="flex items-center gap-2"><IconeRelogio className="h-4 w-4 text-igreja-vivo" />{horaLocal(i.inicio)} – {horaLocal(i.fim)}</li>
        </ul>

        {fase === 'agora' && (
          <div className="relative mt-3 h-1.5 rounded-full bg-igreja-borda/60" aria-label={`${Math.round(progresso)}% do tempo decorrido`}>
            <div className="h-full rounded-full bg-igreja-vivo" style={{ width: `${progresso}%` }} />
            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-igreja-vivo shadow" style={{ left: `${progresso}%` }} />
          </div>
        )}

        {(ativa || i.reservaId || i.tipo === 'bloqueio') && (
          <div className="mt-3 flex flex-wrap gap-2">
            {ativa && fase === 'agora' && (
              <FormAcao inline acao={acaoLiberarSala} botao="Liberar sala agora" classeBotao="btn-verde" confirmar={`Encerrar "${i.titulo}" agora e liberar a sala?`}>
                <input type="hidden" name="id" value={i.ocorrenciaId} />
              </FormAcao>
            )}
            {ativa && fase === 'futuro' && (
              <FormAcao inline acao={acaoCancelarOcorrencia} botao="Cancelar reserva" classeBotao="btn-secundario" confirmar={`Cancelar "${i.titulo}" de ${dataBR(i.inicio)}?`}>
                <input type="hidden" name="id" value={i.ocorrenciaId} />
              </FormAcao>
            )}
            {i.reservaId && <Link href={`/admin/reservas/${i.reservaId}`} className="btn-secundario">Detalhes</Link>}
            {i.tipo === 'bloqueio' && <Link href={`/admin/salas/${salaId}/gerenciar`} className="btn-secundario">Gerenciar bloqueio</Link>}
          </div>
        )}
      </div>
    </li>
  );
}

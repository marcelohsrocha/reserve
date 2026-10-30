import Link from 'next/link';
import { db } from '@/lib/db';
import { DATA_VALIDA, dataLocal, dataPorExtenso, horaLocal, limitesDoDia, localParaUtc, somarDias } from '@/lib/tempo';
import { codigoSala } from '@/domain/sala';
import { obterPainel } from '@/services/painel';
import { doDia, itensAgenda, marcadoresDoPeriodo } from '@/services/agenda';
import { ocupacaoDasSalas, rankingPessoas } from '@/services/estatisticas';
import { obterConfiguracao } from '@/services/configuracao';
import { CalendarioMes } from '@/components/CalendarioMes';
import { StatusOcorrenciaPill, StatusSala } from '@/components/Status';
import { AtualizacaoAoVivo } from '@/components/AtualizacaoAoVivo';
import { FormAcao } from '@/components/FormAcao';
import { IconeAlerta, IconeAvancar, IconeMais, IconePessoa, IconeRelogio } from '@/components/icones';
import { acaoSincronizarAgora } from './acoes';

const fmtHoraBR = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Campo_Grande', dateStyle: 'short', timeStyle: 'short' });

export default async function AdminInicio({ searchParams }: { searchParams: Promise<{ mes?: string; dia?: string }> }) {
  const sp = await searchParams;
  const agora = new Date();
  const hoje = dataLocal(agora);
  const dia = sp.dia && DATA_VALIDA.test(sp.dia) ? sp.dia : hoje;
  const mes = sp.mes && /^\d{4}-\d{2}$/.test(sp.mes) ? sp.mes : dia.slice(0, 7);

  const totalSalas = await db.sala.count();
  if (totalSalas === 0) {
    return (
      <div className="cartao mx-auto mt-10 max-w-lg space-y-4 text-center">
        <h1 className="text-2xl font-bold">Bem-vindo!</h1>
        <p className="text-slate-600">Ainda não há salas cadastradas. Comece cadastrando as salas da igreja.</p>
        <Link href="/admin/salas/nova" className="btn-primario text-base">Cadastre sua primeira sala</Link>
      </div>
    );
  }

  const { inicio: hojeIni, fim: hojeFim } = limitesDoDia(agora);
  const primeiroGrade = somarDias(`${mes}-01`, -new Date(`${mes}-01T12:00:00Z`).getUTCDay());
  const [painel, marcadores, itensDia, itensHoje, ocupacao, ranking, fila, cfg] = await Promise.all([
    obterPainel(agora),
    marcadoresDoPeriodo(primeiroGrade, 42),
    itensAgenda(localParaUtc(dia, '00:00'), localParaUtc(somarDias(dia, 1), '00:00')),
    itensAgenda(hojeIni, hojeFim),
    ocupacaoDasSalas(agora),
    rankingPessoas(agora),
    db.eventoGoogle.count({ where: { estado: 'NAO_IDENTIFICADO', fimUtc: { gt: agora } } }),
    obterConfiguracao(),
  ]);
  const salasCards = painel.andares.flatMap((a) => a.salas);
  const doDiaSel = doDia(itensDia, dia);
  const maxHoras = Math.max(1, ...ocupacao.map((o) => o.horas));
  const href = (p: { mes: string; dia: string }) => `/admin?mes=${p.mes}&dia=${p.dia}`;

  return (
    <div className="space-y-6">
      <AtualizacaoAoVivo />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{dataPorExtenso(hoje)}</p>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Visão geral</h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/salas/nova" className="btn-secundario">Nova sala</Link>
          <Link href={`/admin/reservas/nova?data=${dia}`} className="btn-primario"><IconeMais className="h-4 w-4" /> Nova reserva</Link>
        </div>
      </div>

      {fila > 0 && (
        <Link href="/admin/nao-identificados" className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          <IconeAlerta className="h-5 w-5 shrink-0" />
          <span><strong>{fila}</strong> evento(s) do Google sem sala identificada. Toque para vincular.</span>
          <IconeAvancar className="ml-auto h-4 w-4" />
        </Link>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Calendário em destaque + agenda do dia escolhido */}
        <div className="space-y-6">
          <CalendarioMes mes={mes} diaSelecionado={dia} hoje={hoje} marcadores={marcadores} href={href} />

          <section className="cartao">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold">{dia === hoje ? 'Hoje' : dataPorExtenso(dia)}</h2>
                <p className="subtitulo">{doDiaSel.length ? `${doDiaSel.length} agendamento(s) em ${new Set(doDiaSel.map((i) => i.sala.id)).size} sala(s)` : 'Nada agendado'}</p>
              </div>
              <Link href={`/admin/reservas/nova?data=${dia}`} className="btn-icone" aria-label="Reservar neste dia"><IconeMais className="h-5 w-5" /></Link>
            </div>
            {doDiaSel.length === 0 ? (
              <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Nenhuma sala reservada neste dia.</p>
            ) : (
              <ul className="space-y-2">
                {doDiaSel.map((i) => {
                  const agoraNele = i.inicio <= agora && i.fim > agora && i.status !== 'FINALIZADA' && i.status !== 'NAO_COMPARECEU';
                  return (
                    <li key={i.chave}>
                      <Link
                        href={`/admin/salas/${i.sala.id}?dia=${dia}`}
                        className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-slate-50 ${agoraNele ? 'bg-gradient-to-r from-igreja-claro to-white ring-1 ring-igreja-borda' : ''}`}
                      >
                        <div className="w-14 shrink-0 text-right">
                          <div className="text-sm font-semibold tabular-nums">{horaLocal(i.inicio)}</div>
                          <div className="text-xs tabular-nums text-slate-400">{horaLocal(i.fim)}</div>
                        </div>
                        <span className={`flex h-10 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold ${i.tipo === 'bloqueio' ? 'bg-slate-100 text-slate-500' : 'bg-igreja-claro text-igreja'}`}>
                          {codigoSala(i.sala.numero)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={`truncate font-semibold ${i.status === 'FINALIZADA' || i.status === 'NAO_COMPARECEU' ? 'text-slate-400' : ''}`}>{i.titulo}</div>
                          <div className="truncate text-xs text-slate-500">{i.sala.nome}{i.responsavel && ` · ${i.responsavel}`}</div>
                        </div>
                        <span className="hidden sm:block">
                          {i.status ? <StatusOcorrenciaPill status={i.status} /> : i.tipo === 'google' && <span className="etiqueta bg-slate-100 text-slate-500">Google</span>}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Um botão por sala */}
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Salas</h2>
            <Link href="/admin/salas" className="text-sm text-igreja hover:underline">Gerenciar todas</Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {salasCards.map((s) => {
              const nHoje = doDia(itensHoje, hoje).filter((i) => i.sala.id === s.id && i.tipo !== 'bloqueio').length;
              return (
                <Link key={s.id} href={`/admin/salas/${s.id}`} className="group flex flex-col gap-2 rounded-3xl bg-white p-4 shadow-suave ring-1 ring-transparent transition hover:-translate-y-0.5 hover:ring-igreja-borda">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-2xl font-black tracking-tight">{s.codigo}</span>
                    <IconeAvancar className="mt-1 h-4 w-4 text-slate-300 transition group-hover:text-igreja" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold leading-tight">{s.nome}</div>
                    <div className="text-xs text-slate-500">{s.andar}</div>
                  </div>
                  <StatusSala estado={s.estado} />
                  <div className="text-xs text-slate-500">
                    {s.atual ? (
                      <span className="line-clamp-1">{s.atual.titulo} · até {horaLocal(new Date(s.atual.fim))}</span>
                    ) : s.livreAte && dataLocal(new Date(s.livreAte)) === hoje ? (
                      <>Livre até {horaLocal(new Date(s.livreAte))}</>
                    ) : (
                      <>Livre pelo resto do dia</>
                    )}
                    <span className="block text-slate-400">{nHoje} reserva(s) hoje</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </aside>
      </div>

      {/* Dados */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="cartao">
          <h2 className="text-lg font-bold">Salas mais ocupadas</h2>
          <p className="subtitulo mb-4">Horas reservadas nos últimos e próximos 30 dias</p>
          <ol className="space-y-3">
            {ocupacao.map((o, idx) => (
              <li key={o.salaId}>
                <Link href={`/admin/salas/${o.salaId}`} className="block">
                  <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">
                      <span className="mr-2 text-xs font-semibold text-slate-400">{idx + 1}º</span>
                      <strong>{codigoSala(o.numero)}</strong> {o.nome}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-600">
                      {o.horas.toLocaleString('pt-BR')} h<span className="text-slate-400"> · {o.eventos} evento(s)</span>
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-gradient-to-r from-igreja-vivo to-igreja" style={{ width: `${(o.horas / maxHoras) * 100}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-slate-400">
                    <span>{o.pico ? <>Horário mais procurado: <strong className="text-slate-600">{o.pico}</strong></> : ' '}</span>
                    <span>{o.percentual}% do horário útil</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="cartao">
          <h2 className="text-lg font-bold">Quem mais usa as salas</h2>
          <p className="subtitulo mb-4">Ocorrências nos últimos 90 dias</p>
          {ranking.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Ainda não há uso registrado.</p>
          ) : (
            <ol className="divide-y divide-slate-50">
              {ranking.map((p, idx) => (
                <li key={p.pessoaId} className="flex items-center gap-3 py-2.5">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${idx === 0 ? 'bg-igreja-vivo text-white' : idx < 3 ? 'bg-igreja-claro text-igreja' : 'bg-slate-100 text-slate-500'}`}>
                    {idx + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{p.nome}</div>
                    <div className="flex gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><IconePessoa className="h-3 w-3" />{p.confirmadas} check-in(s)</span>
                      {p.faltas > 0 && <span className="text-orange-600">{p.faltas} falta(s)</span>}
                    </div>
                  </div>
                  <span className="text-right">
                    <span className="block text-lg font-bold tabular-nums leading-none">{p.usos}</span>
                    <span className="text-xs text-slate-400">usos</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl px-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <IconeRelogio className="h-3.5 w-3.5" />
          Google Agenda: último sync {cfg.ultimoSyncEm ? fmtHoraBR(cfg.ultimoSyncEm) : 'nunca'} ·{' '}
          {cfg.watchExpiraEm ? `notificações ativas até ${fmtHoraBR(cfg.watchExpiraEm)}` : 'sem notificações (polling a cada 2 min)'}
        </span>
        <FormAcao inline acao={acaoSincronizarAgora} botao="Sincronizar agora" classeBotao="btn-secundario text-xs" />
      </section>
    </div>
  );
}

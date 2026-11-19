'use client';
import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { acaoCriarReserva, acaoMapaDisponibilidade, type MapaDisponibilidade } from '../../acoes';
import { Mensagem } from '@/components/FormAcao';

interface Opcao {
  id: string;
  rotulo: string;
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DURACOES = [
  { rotulo: '1h', min: 60 },
  { rotulo: '1h30', min: 90 },
  { rotulo: '2h', min: 120 },
  { rotulo: '3h', min: 180 },
];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

function somarMinutos(hora: string, min: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = Math.min(h! * 60 + m! + min, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
function duracaoMin(ini: string, fim: string) {
  if (!HORA.test(ini) || !HORA.test(fim)) return 0;
  const [a, b] = ini.split(':').map(Number);
  const [c, d] = fim.split(':').map(Number);
  return c! * 60 + d! - (a! * 60 + b!);
}
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Campo_Grande' }).format(new Date());

/**
 * Reserva no formato "quando → onde": a pessoa diz o horário e o sistema mostra, ao vivo,
 * quais salas estão livres (em todas as datas, no caso de reserva repetida).
 * `pessoas` só vem para admins (reserva em nome de outra pessoa); membros reservam para si.
 */
export function FormReserva({
  salas,
  pessoas,
  eu,
  inicial,
}: {
  salas: Opcao[];
  pessoas: (Opcao & { busca: string })[] | null;
  eu: Opcao;
  inicial: { salaId?: string; data?: string; inicio?: string; fim?: string };
}) {
  const [estadoSalvar, salvar, salvando] = useActionState(acaoCriarReserva, null);

  // Quando
  const [dataInicio, setDataInicio] = useState(inicial.data ?? hoje());
  const [repetir, setRepetir] = useState(false);
  const [dataFim, setDataFim] = useState(inicial.data ?? hoje());
  const [dias, setDias] = useState<number[]>([]);
  const [horaInicio, setHoraInicio] = useState(inicial.inicio ?? '');
  const [horaFim, setHoraFim] = useState(inicial.fim ?? '');

  // Onde
  const [salaId, setSalaId] = useState(inicial.salaId ?? '');
  const [mapa, setMapa] = useState<MapaDisponibilidade | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [pular, setPular] = useState(false);
  const [verOcupadas, setVerOcupadas] = useState(false);

  // Quem / o quê
  const [pessoaId, setPessoaId] = useState(eu.id);
  const [busca, setBusca] = useState('');
  const [titulo, setTitulo] = useState('');

  const fimEfetivo = repetir ? dataFim : dataInicio;
  const pronto = DATA.test(dataInicio) && DATA.test(fimEfetivo) && fimEfetivo >= dataInicio && HORA.test(horaInicio) && HORA.test(horaFim) && horaFim > horaInicio;

  // Consulta a disponibilidade sozinha, 400 ms depois da última mudança no "quando".
  const pedido = useRef(0);
  useEffect(() => {
    if (!pronto) {
      setMapa(null);
      return;
    }
    const n = ++pedido.current;
    setConsultando(true);
    const t = setTimeout(async () => {
      const r = await acaoMapaDisponibilidade({ dataInicio, dataFim: fimEfetivo, horaInicio, horaFim, diasSemana: repetir ? dias : [] });
      if (n !== pedido.current) return; // chegou uma resposta antiga
      setMapa(r);
      setConsultando(false);
    }, 400);
    return () => clearTimeout(t);
  }, [pronto, dataInicio, fimEfetivo, horaInicio, horaFim, repetir, dias]);

  const salasOrdenadas = useMemo(() => {
    if (!mapa?.ok) return [];
    return [...mapa.salas].sort((a, b) => a.datasOcupadas - b.datasOcupadas);
  }, [mapa]);
  const livres = salasOrdenadas.filter((s) => s.datasOcupadas === 0);
  const parciais = mapa?.ok ? salasOrdenadas.filter((s) => s.datasOcupadas > 0 && s.datasOcupadas < mapa.total) : [];
  const ocupadas = mapa?.ok ? salasOrdenadas.filter((s) => s.datasOcupadas >= mapa.total) : [];
  const escolhida = mapa?.ok ? mapa.salas.find((s) => s.id === salaId) : undefined;
  const escolhidaParcial = Boolean(escolhida && parciais.includes(escolhida));
  const escolhidaOcupada = Boolean(escolhida && ocupadas.includes(escolhida));
  const nomeSalaInicial = salas.find((s) => s.id === inicial.salaId)?.rotulo;

  const pessoasFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qd = q.replace(/\D/g, '');
    const lista = pessoas ?? [];
    const r = q ? lista.filter((p) => p.busca.toLowerCase().includes(q) || (qd.length >= 2 && p.busca.replace(/\D/g, '').includes(qd))) : lista;
    return r.slice(0, 8);
  }, [busca, pessoas]);
  const pessoaEscolhida = pessoas?.find((p) => p.id === pessoaId);

  const podeSalvar = pronto && mapa?.ok && escolhida && !escolhidaOcupada && (!escolhidaParcial || pular) && titulo.trim() && pessoaId;

  function enviar() {
    if (!podeSalvar) return;
    const fd = new FormData();
    fd.set('salaId', salaId);
    fd.set('pessoaId', pessoaId);
    fd.set('titulo', titulo.trim());
    fd.set('dataInicio', dataInicio);
    fd.set('dataFim', fimEfetivo);
    fd.set('horaInicio', horaInicio);
    fd.set('horaFim', horaFim);
    if (repetir) for (const d of dias) fd.append('diasSemana', String(d));
    if (escolhidaParcial && pular) fd.set('pularConflitos', '1');
    startTransition(() => salvar(fd));
  }

  const dur = duracaoMin(horaInicio, horaFim);
  const livresNaEscolhida = escolhida && mapa?.ok ? mapa.total - escolhida.datasOcupadas : 0;

  return (
    <div className="space-y-4">
      {/* 1. QUANDO */}
      <section className="cartao space-y-4">
        <Passo n={1} titulo="Quando?" />
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo" htmlFor="dataInicio">{repetir ? 'De' : 'Data'}</label>
            <input
              id="dataInicio"
              type="date"
              className="campo"
              min={hoje()}
              value={dataInicio}
              onChange={(e) => {
                setDataInicio(e.target.value);
                if (dataFim < e.target.value) setDataFim(e.target.value);
              }}
            />
          </div>
          {repetir && (
            <div className="col-span-2 sm:col-span-1">
              <label className="rotulo" htmlFor="dataFim">Até</label>
              <input id="dataFim" type="date" className="campo" min={dataInicio} value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
            </div>
          )}
          <div>
            <label className="rotulo" htmlFor="horaInicio">Começa</label>
            <input
              id="horaInicio"
              type="time"
              className="campo"
              value={horaInicio}
              onChange={(e) => {
                const novo = e.target.value;
                // Mantém a duração escolhida ao mudar o início.
                if (HORA.test(novo) && dur > 0) setHoraFim(somarMinutos(novo, dur));
                else if (HORA.test(novo) && !horaFim) setHoraFim(somarMinutos(novo, 120));
                setHoraInicio(novo);
              }}
            />
          </div>
          <div>
            <label className="rotulo" htmlFor="horaFim">Termina</label>
            <input id="horaFim" type="time" className="campo" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Duração:</span>
          {DURACOES.map((d) => (
            <button
              key={d.min}
              type="button"
              disabled={!HORA.test(horaInicio)}
              onClick={() => setHoraFim(somarMinutos(horaInicio, d.min))}
              className={`rounded-full px-3 py-1.5 text-sm ring-1 disabled:opacity-40 ${dur === d.min ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white text-slate-700 ring-slate-200'}`}
            >
              {d.rotulo}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} className="h-5 w-5" />
          Repetir em vários dias
        </label>
        {repetir && (
          <div>
            <p className="mb-2 text-xs text-slate-500">Uma data por dia no período, sempre no mesmo horário. Marque dias para limitar (ex.: só terças e quintas).</p>
            <div className="flex flex-wrap gap-2">
              {DIAS.map((d, i) => {
                const on = dias.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setDias(on ? dias.filter((x) => x !== i) : [...dias, i].sort())}
                    className={`min-w-12 rounded-xl px-3 py-2 text-sm ring-1 ${on ? 'bg-igreja text-white ring-igreja' : 'bg-white text-slate-700 ring-slate-200'}`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 2. ONDE */}
      <section className="cartao space-y-3">
        <Passo n={2} titulo="Onde?" />
        {!pronto && <p className="text-sm text-slate-500">Informe data e horário para ver as salas livres{nomeSalaInicial ? ` (você veio pela ${nomeSalaInicial})` : ''}.</p>}
        {pronto && consultando && !mapa && <p className="text-sm text-slate-500">Consultando a agenda…</p>}
        {mapa && !mapa.ok && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{mapa.mensagem}</p>}
        {mapa?.ok && (
          <div className={`space-y-3 transition-opacity ${consultando ? 'opacity-60' : ''}`}>
            {mapa.total > 1 && (
              <p className="text-xs text-slate-500">
                {mapa.total} datas: {mapa.datas.join(', ')}
              </p>
            )}
            {livres.length === 0 && parciais.length === 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Nenhuma sala livre nesse horário. Tente outro horário ou outro dia.</p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {livres.map((s) => (
                <OpcaoSala key={s.id} s={s} marcada={salaId === s.id} onEscolher={() => setSalaId(s.id)} selo={mapa.total > 1 ? `Livre nas ${mapa.total} datas` : 'Livre'} cor="verde" />
              ))}
              {parciais.map((s) => (
                <OpcaoSala
                  key={s.id}
                  s={s}
                  marcada={salaId === s.id}
                  onEscolher={() => setSalaId(s.id)}
                  selo={`Ocupada em ${s.datasOcupadas} de ${mapa.total}`}
                  cor="amarelo"
                />
              ))}
            </div>
            {ocupadas.length > 0 && (
              <div>
                <button type="button" className="text-xs text-slate-500 underline" onClick={() => setVerOcupadas(!verOcupadas)}>
                  {verOcupadas ? 'Esconder' : 'Ver'} {ocupadas.length} sala(s) ocupada(s)
                </button>
                {verOcupadas && (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {ocupadas.map((s) => (
                      <li key={s.id}>
                        <strong>{s.codigo} – {s.nome}</strong>: {s.conflitos[0]}
                        {s.conflitos.length > 1 && ` (+${s.conflitos.length - 1})`}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {escolhidaOcupada && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {escolhida!.codigo} está ocupada nesse horário: {escolhida!.conflitos[0]}. Escolha uma das salas livres acima.
              </p>
            )}
            {escolhidaParcial && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <ul className="mb-2 list-disc pl-5 text-xs">
                  {escolhida!.conflitos.slice(0, 6).map((c) => <li key={c}>{c}</li>)}
                  {escolhida!.conflitos.length > 6 && <li>… e mais {escolhida!.conflitos.length - 6}</li>}
                </ul>
                <label className="flex items-center gap-2 font-medium">
                  <input type="checkbox" checked={pular} onChange={(e) => setPular(e.target.checked)} className="h-5 w-5" />
                  Reservar só as {livresNaEscolhida} datas livres e pular as ocupadas
                </label>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. QUEM E O QUÊ */}
      <section className="cartao space-y-4">
        <Passo n={3} titulo="Para quê?" />
        <div>
          <label className="rotulo" htmlFor="titulo">Título / finalidade</label>
          <input id="titulo" maxLength={100} className="campo" placeholder="Ex.: Ensaio do louvor" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        </div>

        {pessoas === null ? (
          <div>
            <span className="rotulo">Responsável</span>
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{eu.rotulo} (você)</p>
          </div>
        ) : (
          <div>
            <span className="rotulo">Responsável</span>
            {pessoaEscolhida && (
              <p className="mb-2 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span>
                  <strong>{pessoaEscolhida.rotulo}</strong>
                  {pessoaEscolhida.id === eu.id && ' (você)'}
                </span>
              </p>
            )}
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Trocar: buscar por nome ou telefone…" className="campo" />
            {busca.trim() && (
              <ul className="mt-1 divide-y divide-slate-100 overflow-hidden rounded-xl ring-1 ring-slate-200" role="listbox">
                {pessoasFiltradas.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Ninguém encontrado.</li>}
                {pessoasFiltradas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={p.id === pessoaId}
                      onClick={() => {
                        setPessoaId(p.id);
                        setBusca('');
                      }}
                      className="block w-full px-3 py-3 text-left text-sm hover:bg-slate-50"
                    >
                      {p.rotulo}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <a href="/admin/pessoas" target="_blank" className="mt-1 inline-block text-xs text-igreja underline">Cadastrar nova pessoa</a>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-4 pb-4 pt-6 sm:static sm:mx-0 sm:bg-none sm:p-0">
        <button type="button" className="btn-primario w-full py-3 text-base" disabled={!podeSalvar || salvando} onClick={enviar}>
          {salvando
            ? 'Salvando…'
            : escolhida && mapa?.ok
              ? `Reservar ${escolhida.codigo}${(escolhidaParcial ? livresNaEscolhida : mapa.total) > 1 ? ` · ${escolhidaParcial ? livresNaEscolhida : mapa.total} datas` : ''}`
              : 'Escolha a sala'}
        </button>
        {!titulo.trim() && escolhida && !escolhidaOcupada && <p className="mt-1 text-center text-xs text-slate-500">Falta o título.</p>}
        <Mensagem estado={estadoSalvar} />
      </div>
    </div>
  );
}


function Passo({ n, titulo }: { n: number; titulo: string }) {
  return (
    <h2 className="flex items-center gap-2 font-semibold">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-igreja text-xs text-white">{n}</span>
      {titulo}
    </h2>
  );
}

function OpcaoSala({
  s,
  marcada,
  onEscolher,
  selo,
  cor,
}: {
  s: { codigo: string; nome: string; andar: string };
  marcada: boolean;
  onEscolher: () => void;
  selo: string;
  cor: 'verde' | 'amarelo';
}) {
  return (
    <button
      type="button"
      aria-pressed={marcada}
      onClick={onEscolher}
      className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-left ring-2 transition ${marcada ? 'bg-igreja-claro ring-igreja' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}
    >
      <span className="text-xl font-black text-slate-800">{s.codigo}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{s.nome}</span>
        <span className="block text-xs text-slate-500">{s.andar}</span>
      </span>
      <span className={`etiqueta shrink-0 ${cor === 'verde' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{selo}</span>
    </button>
  );
}

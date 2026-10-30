'use client';
import { useMemo, useState } from 'react';
import type { DadosPainel } from '@/services/painel';
import { useAgora, useAoVivo } from '@/components/useAoVivo';
import { fmtHora, hojeLocal, mesmoDia } from '@/lib/formato-cliente';

interface SalaLivre {
  id: string;
  codigo: string;
  nome: string;
  andar: string;
}

function linkReserva(salaId: string, data?: string, inicio?: string, fim?: string) {
  const q = new URLSearchParams({ salaId });
  if (data) q.set('data', data);
  if (inicio) q.set('inicio', inicio);
  if (fim) q.set('fim', fim);
  return `/admin/reservas/nova?${q}`;
}

export function Disponiveis() {
  const { dados } = useAoVivo<DadosPainel>('/api/painel');
  const agora = useAgora(30_000);
  const [andar, setAndar] = useState('');

  const [busca, setBusca] = useState({ data: hojeLocal(), inicio: '19:00', fim: '21:00' });
  const [resultado, setResultado] = useState<SalaLivre[] | null>(null);
  const [erro, setErro] = useState('');
  const [buscando, setBuscando] = useState(false);

  const andares = dados?.andares.map((a) => a.andar) ?? [];
  const livres = useMemo(
    () => (dados?.andares ?? []).filter((g) => !andar || g.andar === andar).flatMap((g) => g.salas).filter((s) => s.estado === 'LIVRE'),
    [dados, andar],
  );

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setBuscando(true);
    try {
      const r = await fetch(`/api/disponibilidade?${new URLSearchParams(busca)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro);
      setResultado(j.salas);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Falha na busca.');
    } finally {
      setBuscando(false);
    }
  }

  const resultadoFiltrado = resultado?.filter((s) => !andar || s.andar === andar);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10" />
          <h1 className="text-xl font-bold sm:text-2xl">Salas disponíveis</h1>
        </div>
        <div className="flex gap-2 text-sm">
          <a href="/painel" className="btn-secundario">Painel</a>
          <a href="/admin" className="btn-secundario">Administração</a>
        </div>
      </header>

      <div>
        <label className="rotulo" htmlFor="andar">Filtrar por andar</label>
        <select id="andar" className="campo max-w-xs" value={andar} onChange={(e) => setAndar(e.target.value)}>
          <option value="">Todos os andares</option>
          {andares.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">Livres agora</h2>
        {!dados && <p className="text-slate-500">Carregando…</p>}
        {dados && livres.length === 0 && <p className="cartao text-slate-600">Nenhuma sala livre neste momento.</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {livres.map((s) => (
            <li key={s.id} className="cartao flex items-center justify-between gap-3 border-l-4 border-l-emerald-500">
              <div>
                <div className="font-bold">
                  {s.codigo} – {s.nome}
                </div>
                <div className="text-sm text-slate-600">{s.andar}</div>
                <div className="text-sm font-medium text-emerald-700">
                  {s.livreAte && mesmoDia(s.livreAte, agora) ? `Livre até ${fmtHora(s.livreAte)}` : 'Livre pelo resto do dia'}
                </div>
              </div>
              <a className="btn-primario shrink-0" href={linkReserva(s.id)}>
                Reservar esta sala
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="cartao space-y-3">
        <h2 className="text-lg font-semibold">Buscar disponibilidade futura</h2>
        <form onSubmit={buscar} className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <label className="rotulo">Data</label>
            <input type="date" className="campo" required value={busca.data} onChange={(e) => setBusca({ ...busca, data: e.target.value })} />
          </div>
          <div>
            <label className="rotulo">Início</label>
            <input type="time" className="campo" required value={busca.inicio} onChange={(e) => setBusca({ ...busca, inicio: e.target.value })} />
          </div>
          <div>
            <label className="rotulo">Fim</label>
            <input type="time" className="campo" required value={busca.fim} onChange={(e) => setBusca({ ...busca, fim: e.target.value })} />
          </div>
          <button className="btn-primario col-span-2 sm:col-span-1" disabled={buscando}>
            {buscando ? 'Buscando…' : 'Buscar salas livres'}
          </button>
        </form>
        {erro && <p className="text-sm text-red-700">{erro}</p>}
        {resultadoFiltrado && (
          resultadoFiltrado.length === 0 ? (
            <p className="text-slate-600">Nenhuma sala livre nesse horário.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {resultadoFiltrado.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <span className="font-semibold">{s.codigo} – {s.nome}</span>
                    <span className="text-sm text-slate-600"> · {s.andar}</span>
                  </div>
                  <a className="btn-secundario" href={linkReserva(s.id, busca.data, busca.inicio, busca.fim)}>
                    Reservar esta sala
                  </a>
                </li>
              ))}
            </ul>
          )
        )}
      </section>
    </div>
  );
}

'use client';
import { useState } from 'react';
import type { DadosPainel } from '@/services/painel';
import { CardSala } from '@/components/CardSala';
import { useAgora, useAoVivo } from '@/components/useAoVivo';
import { fmtDiaLongo } from '@/lib/formato-cliente';

const relogio = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Campo_Grande',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function PainelAoVivo() {
  const { dados, conectado } = useAoVivo<DadosPainel>('/api/painel');
  const agora = useAgora();
  const [telaCheia, setTelaCheia] = useState(false);

  function alternarTelaCheia() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
      setTelaCheia(false);
    } else {
      document.documentElement.requestFullscreen?.();
      setTelaCheia(true);
    }
  }

  const contagem = dados?.andares.flatMap((a) => a.salas).reduce<Record<string, number>>((acc, s) => {
    acc[s.estado] = (acc[s.estado] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 bg-slate-950/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <img src="/logo.svg" alt="" className="h-10 w-10 rounded bg-white p-1" />
          <div>
            <div className="text-lg font-bold leading-tight sm:text-xl">Salas agora · IPI Dourados</div>
            <div className="text-sm capitalize text-slate-300">{fmtDiaLongo(agora)}</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {contagem && (
            <div className="hidden gap-3 text-sm md:flex">
              <span className="text-emerald-400">● {contagem.LIVRE ?? 0} livres</span>
              <span className="text-amber-300">● {contagem.RESERVADA ?? 0} reservadas</span>
              <span className="text-red-400">● {contagem.OCUPADA ?? 0} ocupadas</span>
              <span className="text-slate-400">● {contagem.BLOQUEADA ?? 0} bloqueadas</span>
            </div>
          )}
          <div className="font-mono text-3xl font-bold tabular-nums sm:text-4xl">{relogio.format(agora)}</div>
          <button onClick={alternarTelaCheia} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800" title="Tela cheia">
            {telaCheia ? 'Sair' : 'Tela cheia'}
          </button>
          <span title={conectado ? 'Tempo real conectado' : 'Reconectando…'} className={`h-3 w-3 rounded-full ${conectado ? 'bg-emerald-400' : 'animate-pulse bg-amber-400'}`} />
        </div>
      </header>

      <main className="space-y-6 p-4 sm:p-6">
        {!dados && <p className="text-slate-400">Carregando…</p>}
        {dados && dados.total === 0 && (
          <div className="flex h-[60vh] items-center justify-center text-3xl font-semibold text-slate-400">Nenhuma sala cadastrada</div>
        )}
        {dados?.andares.map((g) => (
          <section key={g.andar}>
            <h2 className="mb-3 text-lg font-bold uppercase tracking-wider text-slate-300">{g.andar}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {g.salas.map((s) => (
                <div key={s.id} className="text-slate-900">
                  <CardSala sala={s} agora={agora} grande />
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

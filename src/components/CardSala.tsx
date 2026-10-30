'use client';
import type { CardSala as Card } from '@/services/painel';
import { fmtDia, fmtHora, mesmoDia } from '@/lib/formato-cliente';

const ESTILO: Record<Card['estado'], { fundo: string; faixa: string; rotulo: string }> = {
  LIVRE: { fundo: 'bg-emerald-50 border-emerald-300', faixa: 'bg-emerald-500', rotulo: 'Livre' },
  RESERVADA: { fundo: 'bg-amber-50 border-amber-300', faixa: 'bg-amber-400', rotulo: 'Reservada · aguardando check-in' },
  OCUPADA: { fundo: 'bg-red-50 border-red-300', faixa: 'bg-red-600', rotulo: 'Ocupada' },
  BLOQUEADA: { fundo: 'bg-slate-100 border-slate-300', faixa: 'bg-slate-500', rotulo: 'Bloqueada' },
};

function progresso(inicio: string, fim: string, agora: Date) {
  const i = new Date(inicio).getTime();
  const f = new Date(fim).getTime();
  return Math.min(100, Math.max(0, ((agora.getTime() - i) / (f - i)) * 100));
}

function quando(iso: string, agora: Date) {
  return mesmoDia(iso, agora) ? fmtHora(iso) : `${fmtDia(iso)} ${fmtHora(iso)}`;
}

export function CardSala({ sala, agora, grande = false }: { sala: Card; agora: Date; grande?: boolean }) {
  const e = ESTILO[sala.estado];
  const a = sala.atual;
  return (
    <div className={`overflow-hidden rounded-xl border-2 ${e.fundo} shadow-sm`}>
      <div className={`${e.faixa} flex items-center justify-between px-4 py-2 text-white`}>
        <span className={`font-black tracking-wide ${grande ? 'text-3xl' : 'text-2xl'}`}>{sala.codigo}</span>
        <span className="text-right text-sm font-semibold uppercase">{e.rotulo}</span>
      </div>
      <div className="space-y-2 p-4">
        <div>
          <div className={`font-bold leading-tight ${grande ? 'text-xl' : 'text-lg'}`}>{sala.nome}</div>
          <div className="text-sm text-slate-600">{sala.andar}</div>
        </div>

        {a && sala.estado === 'BLOQUEADA' && (
          <div className="text-sm">
            <div className="font-semibold">{a.titulo}</div>
            <div className="text-slate-600">até {quando(a.fim, agora)}</div>
          </div>
        )}

        {a && sala.estado !== 'BLOQUEADA' && (
          <div className="space-y-1 text-sm">
            <div className="text-base font-semibold">{a.titulo}</div>
            {a.responsavel && <div className="text-slate-700">Responsável: {a.responsavel}</div>}
            <div className="text-slate-700">
              {fmtHora(a.inicio)} – {fmtHora(a.fim)}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/70">
              <div className={`h-full ${e.faixa}`} style={{ width: `${progresso(a.inicio, a.fim, agora)}%` }} />
            </div>
          </div>
        )}

        {sala.estado === 'LIVRE' && (
          <div className="text-sm font-semibold text-emerald-800">
            {sala.livreAte && mesmoDia(sala.livreAte, agora) ? `Livre até ${fmtHora(sala.livreAte)}` : 'Livre pelo resto do dia'}
          </div>
        )}

        <div className="border-t border-black/5 pt-2 text-xs text-slate-600">
          {sala.proximo ? (
            <>
              <span className="font-semibold">Próximo:</span> {quando(sala.proximo.inicio, agora)} · {sala.proximo.titulo}
            </>
          ) : (
            'Sem próximos agendamentos'
          )}
        </div>
      </div>
    </div>
  );
}

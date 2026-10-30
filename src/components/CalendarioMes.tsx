import Link from 'next/link';
import { DIAS_SEMANA, diaSemanaDaData, nomeMes, somarDias, somarMeses } from '@/lib/tempo';
import { IconeAvancar, IconeVoltar } from './icones';

/**
 * Calendário mensal em destaque. Datas com agendamento ganham pontos; clicar numa data
 * leva para `?mes=…&dia=…` (a página mostra o que acontece naquele dia e em quais salas).
 */
export function CalendarioMes({
  mes,
  diaSelecionado,
  hoje,
  marcadores,
  href,
}: {
  mes: string; // AAAA-MM
  diaSelecionado: string;
  hoje: string;
  marcadores: Map<string, number>;
  href: (p: { mes: string; dia: string }) => string;
}) {
  const primeiro = `${mes}-01`;
  const inicioGrade = somarDias(primeiro, -diaSemanaDaData(primeiro));
  const dias = Array.from({ length: 42 }, (_, i) => somarDias(inicioGrade, i));
  // Remove a última semana se ela estiver toda no mês seguinte.
  const semanas = dias.slice(35).every((d) => d.slice(0, 7) !== mes) ? dias.slice(0, 35) : dias;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-white p-5 shadow-suave sm:p-7">
      <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-igreja-vivo/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-64 w-64 rounded-full bg-igreja-vivo/10 blur-3xl" />
      <div className="relative">
        <div className="mb-5 flex items-center justify-between gap-2">
          <Link href={href({ mes: somarMeses(mes, -1), dia: diaSelecionado })} scroll={false} className="btn-icone" aria-label="Mês anterior">
            <IconeVoltar className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <h2 className="text-lg font-bold sm:text-xl">{nomeMes(mes)}</h2>
            {mes !== hoje.slice(0, 7) || diaSelecionado !== hoje ? (
              <Link href={href({ mes: hoje.slice(0, 7), dia: hoje })} scroll={false} className="text-xs font-medium text-igreja hover:underline">
                Voltar para hoje
              </Link>
            ) : (
              <span className="text-xs text-slate-400">Toque numa data para ver a agenda</span>
            )}
          </div>
          <Link href={href({ mes: somarMeses(mes, 1), dia: diaSelecionado })} scroll={false} className="btn-icone" aria-label="Próximo mês">
            <IconeAvancar className="h-5 w-5" />
          </Link>
        </div>

        <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          {DIAS_SEMANA.map((d) => <div key={d} className="pb-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {semanas.map((d) => {
            const doMes = d.slice(0, 7) === mes;
            const sel = d === diaSelecionado;
            const ehHoje = d === hoje;
            const n = marcadores.get(d) ?? 0;
            return (
              <Link
                key={d}
                href={href({ mes, dia: d })}
                scroll={false}
                aria-current={sel ? 'date' : undefined}
                aria-label={`${d.split('-').reverse().join('/')}${n ? `, ${n} agendamento(s)` : ''}`}
                className={`group flex h-12 flex-col items-center justify-center rounded-2xl transition sm:h-16 ${
                  sel
                    ? 'bg-igreja-vivo text-white shadow-[0_8px_20px_-8px_rgba(31,196,141,.8)]'
                    : doMes
                      ? 'text-slate-800 hover:bg-igreja-claro'
                      : 'text-slate-300 hover:bg-slate-50'
                }`}
              >
                <span className={`text-sm sm:text-base ${ehHoje && !sel ? 'font-bold text-igreja' : sel ? 'font-bold' : ''}`}>{Number(d.slice(8))}</span>
                <span className="mt-1 flex h-1.5 gap-0.5">
                  {Array.from({ length: Math.min(n, 3) }, (_, i) => (
                    <span key={i} className={`h-1.5 w-1.5 rounded-full ${sel ? 'bg-white' : doMes ? 'bg-igreja-vivo' : 'bg-slate-200'}`} />
                  ))}
                  {ehHoje && !sel && n === 0 && <span className="h-0.5 w-3 self-end rounded bg-igreja" />}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

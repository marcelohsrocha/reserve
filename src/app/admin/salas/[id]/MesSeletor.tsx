'use client';
import { useRouter } from 'next/navigation';

/** Seletor de mês (como o "January ⌄" do layout de referência). */
export function MesSeletor({ valor, opcoes, base }: { valor: string; opcoes: { mes: string; rotulo: string }[]; base: string }) {
  const router = useRouter();
  return (
    <select
      aria-label="Mês"
      value={valor}
      onChange={(e) => router.push(`${base}?dia=${e.target.value}-01`, { scroll: false })}
      className="rounded-full border border-slate-300 bg-white py-1 pl-3 pr-8 text-sm font-semibold focus:border-igreja focus:outline-none"
    >
      {opcoes.map((o) => (
        <option key={o.mes} value={o.mes}>{o.rotulo}</option>
      ))}
    </select>
  );
}

import Link from 'next/link';
import { db } from '@/lib/db';
import { usuarioAtual } from '@/lib/usuario';
import { NavAdmin } from './NavAdmin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [usuario, fila] = await Promise.all([
    usuarioAtual(),
    db.eventoGoogle.count({ where: { estado: 'NAO_IDENTIFICADO', fimUtc: { gt: new Date() } } }),
  ]);
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <img src="/logo.svg" alt="" className="h-9 w-9 rounded-xl" />
            <span className="leading-tight">
              <span className="block text-sm font-bold">Reservas de Salas</span>
              <span className="block text-xs text-slate-500">IPI Dourados</span>
            </span>
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link href="/painel" className="rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100">Painel</Link>
            <Link href="/disponiveis" className="rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100">Disponíveis</Link>
            <span className="ml-2 hidden max-w-[14rem] truncate rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500 md:inline">{usuario}</span>
          </div>
        </div>
        <NavAdmin fila={fila} />
      </header>
      <main className="mx-auto max-w-7xl p-4 sm:p-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}

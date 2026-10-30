import Link from 'next/link';
import { exigirUsuario } from '@/lib/usuario';
import { NavAdmin } from './NavAdmin';
import { MenuConta } from './MenuConta';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const u = await exigirUsuario();
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
            <Link href="/painel" className="hidden rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100 sm:inline">Painel</Link>
            <Link href="/disponiveis" className="hidden rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100 sm:inline">Disponíveis</Link>
            <MenuConta nome={u.nome} email={u.email!} admin={u.admin} agendaConectada={Boolean(u.googleRefreshToken)} />
          </div>
        </div>
        <NavAdmin admin={u.admin} />
      </header>
      {!u.googleRefreshToken && (
        <div className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 print:hidden">
          <a href="/api/auth/google?consentir=1" className="flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900 ring-1 ring-sky-200">
            <span className="text-lg">📅</span>
            <span><strong>Conecte a sua Agenda Google</strong> para que as suas reservas apareçam nela automaticamente.</span>
          </a>
        </div>
      )}
      <main className="mx-auto max-w-7xl p-4 sm:p-6 print:max-w-none print:p-0">{children}</main>
    </div>
  );
}

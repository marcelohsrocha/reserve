'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  ['/admin', 'Início'],
  ['/admin/salas', 'Salas'],
  ['/admin/reservas', 'Reservas'],
  ['/admin/agenda', 'Agenda'],
  ['/admin/pessoas', 'Pessoas'],
  ['/admin/nao-identificados', 'Não identificados'],
  ['/admin/qrcodes', 'QR Codes'],
  ['/admin/configuracoes', 'Configurações'],
  ['/admin/auditoria', 'Auditoria'],
] as const;

export function NavAdmin({ fila }: { fila: number }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === '/admin' ? caminho === '/admin' : caminho.startsWith(href));
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-3 text-sm">
      {LINKS.map(([href, rotulo]) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 transition ${
            ativo(href) ? 'bg-slate-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {rotulo}
          {href === '/admin/nao-identificados' && fila > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 text-xs font-bold text-slate-900">{fila}</span>
          )}
        </Link>
      ))}
    </nav>
  );
}

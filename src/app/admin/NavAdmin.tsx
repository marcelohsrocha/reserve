'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS: readonly (readonly [string, string, boolean])[] = [
  ['/admin', 'Início', false],
  ['/admin/salas', 'Salas', false],
  ['/admin/reservas', 'Reservas', false],
  ['/admin/agenda', 'Agenda', false],
  ['/admin/pessoas', 'Pessoas', true],
  ['/admin/qrcodes', 'QR Codes', true],
  ['/admin/configuracoes', 'Configurações', true],
  ['/admin/auditoria', 'Auditoria', true],
];

export function NavAdmin({ admin }: { admin: boolean }) {
  const caminho = usePathname();
  const ativo = (href: string) => (href === '/admin' ? caminho === '/admin' : caminho.startsWith(href));
  return (
    <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-3 text-sm">
      {LINKS.filter(([, , soAdmin]) => admin || !soAdmin).map(([href, rotulo]) => (
        <Link
          key={href}
          href={href}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 transition ${
            ativo(href) ? 'bg-slate-900 font-medium text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          {href === '/admin/reservas' && !admin ? 'Minhas reservas' : rotulo}
        </Link>
      ))}
    </nav>
  );
}

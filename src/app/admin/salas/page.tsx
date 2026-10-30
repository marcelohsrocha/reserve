import Link from 'next/link';
import { listarSalas } from '@/services/salas';
import { exigirUsuario } from '@/lib/usuario';
import { codigoSala } from '@/domain/sala';
import { dataBR } from '@/lib/tempo';

const FILTROS = { ativas: 'Ativas', desativadas: 'Desativadas', todas: 'Todas' } as const;

export default async function Salas({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const filtro = (sp.filtro && sp.filtro in FILTROS ? sp.filtro : 'ativas') as keyof typeof FILTROS;
  const salas = await listarSalas(filtro);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina mb-0">Salas</h1>
        {u.admin && <Link href="/admin/salas/nova" className="btn-primario">+ Nova sala</Link>}
      </div>
      <div className="flex gap-1">
        {Object.entries(FILTROS).map(([k, v]) => (
          <Link key={k} href={`?filtro=${k}`} className={k === filtro ? 'btn-primario' : 'btn-secundario'}>{v}</Link>
        ))}
      </div>
      {salas.length === 0 ? (
        <div className="cartao text-slate-600">
          Nenhuma sala {filtro === 'todas' ? 'cadastrada' : filtro === 'ativas' ? 'ativa' : 'desativada'}.{' '}
          {u.admin && filtro !== 'desativadas' && <Link href="/admin/salas/nova" className="text-igreja underline">Cadastre sua primeira sala</Link>}
        </div>
      ) : (
        <div className="cartao overflow-x-auto p-0">
          <table className="tabela">
            <thead>
              <tr><th>Código</th><th>Nome</th><th>Andar</th><th>Situação</th><th>Reservas</th><th></th></tr>
            </thead>
            <tbody>
              {salas.map((s) => (
                <tr key={s.id} className={s.ativa ? '' : 'text-slate-500'}>
                  <td className="font-bold">{codigoSala(s.numero)}</td>
                  <td>{s.nome}</td>
                  <td>{s.andar}</td>
                  <td>
                    {s.ativa ? (
                      <span className="etiqueta bg-emerald-100 text-emerald-800">Ativa</span>
                    ) : (
                      <span className="etiqueta bg-slate-200 text-slate-700">Desativada {s.desativadaEm && `em ${dataBR(s.desativadaEm)}`}</span>
                    )}
                  </td>
                  <td>{s._count.reservas}</td>
                  <td className="text-right">
                    <span className="inline-flex gap-1">
                      <Link href={`/admin/salas/${s.id}`} className="btn-secundario">Agenda</Link>
                      {u.admin && <Link href={`/admin/salas/${s.id}/gerenciar`} className="btn-secundario">Gerenciar</Link>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

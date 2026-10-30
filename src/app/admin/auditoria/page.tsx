import { db } from '@/lib/db';
import { dataHoraBR } from '@/lib/tempo';
import { exigirAdmin } from '@/lib/usuario';

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ entidade?: string }> }) {
  await exigirAdmin();
  const { entidade } = await searchParams;
  const registros = await db.auditoria.findMany({
    where: entidade ? { entidade } : {},
    orderBy: { em: 'desc' },
    take: 300,
  });
  return (
    <div className="space-y-4">
      <h1 className="titulo-pagina">Log de auditoria</h1>
      <form className="flex gap-2">
        <select name="entidade" defaultValue={entidade ?? ''} className="campo w-auto">
          <option value="">Tudo</option>
          {['sala', 'pessoa', 'reserva', 'ocorrencia', 'bloqueio', 'evento_google', 'configuracao'].map((e) => <option key={e}>{e}</option>)}
        </select>
        <button className="btn-secundario">Filtrar</button>
      </form>
      <div className="cartao overflow-x-auto p-0">
        <table className="tabela">
          <thead>
            <tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Entidade</th><th>Detalhes</th></tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dataHoraBR(r.em)}</td>
                <td className="whitespace-nowrap">{r.quem}</td>
                <td>{r.acao}</td>
                <td className="whitespace-nowrap">{r.entidade} <span className="font-mono text-xs text-slate-400">{r.entidadeId.slice(0, 8)}</span></td>
                <td className="max-w-md break-words font-mono text-xs text-slate-600">{r.detalhes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

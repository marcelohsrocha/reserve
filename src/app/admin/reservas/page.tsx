import Link from 'next/link';
import { db } from '@/lib/db';
import { exigirUsuario } from '@/lib/usuario';
import { dataBR, horaLocal, DIAS_SEMANA, diaSemanaLocal, limitesDoDia } from '@/lib/tempo';
import { codigoSala } from '@/domain/sala';
import { ROTULO_STATUS, type StatusOcorrencia } from '@/domain/status';

const COR_STATUS: Record<string, string> = {
  AGENDADA: 'bg-sky-100 text-sky-800',
  EM_ANDAMENTO: 'bg-amber-100 text-amber-800',
  CONFIRMADA: 'bg-red-100 text-red-800',
  FINALIZADA: 'bg-slate-100 text-slate-600',
  CANCELADA: 'bg-slate-100 text-slate-400 line-through',
  NAO_COMPARECEU: 'bg-orange-100 text-orange-800',
};

export default async function Reservas({ searchParams }: { searchParams: Promise<{ sala?: string; historico?: string }> }) {
  const sp = await searchParams;
  const u = await exigirUsuario();
  const historico = sp.historico === '1';
  const { inicio: hoje } = limitesDoDia(new Date());
  const [salas, ocorrencias] = await Promise.all([
    db.sala.findMany({ orderBy: { numero: 'asc' } }),
    db.ocorrencia.findMany({
      where: {
        ...(sp.sala && { salaId: sp.sala }),
        // Membros veem só as próprias reservas.
        ...(!u.admin && { reserva: { pessoaId: u.id } }),
        ...(historico ? { inicioUtc: { lt: hoje } } : { fimUtc: { gte: hoje }, status: { not: 'CANCELADA' } }),
      },
      include: { sala: true, reserva: { include: { pessoa: true } } },
      orderBy: { inicioUtc: historico ? 'desc' : 'asc' },
      take: 300,
    }),
  ]);
  const porDia = new Map<string, typeof ocorrencias>();
  for (const o of ocorrencias) {
    const k = dataBR(o.inicioUtc);
    if (!porDia.has(k)) porDia.set(k, []);
    porDia.get(k)!.push(o);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="titulo-pagina mb-0">{u.admin ? 'Reservas' : 'Minhas reservas'}</h1>
        <Link href="/admin/reservas/nova" className="btn-primario">+ Nova reserva</Link>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <div>
          <label className="rotulo">Sala</label>
          <select name="sala" defaultValue={sp.sala ?? ''} className="campo">
            <option value="">Todas</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>{codigoSala(s.numero)} – {s.nome}{s.ativa ? '' : ' (desativada)'}</option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" name="historico" value="1" defaultChecked={historico} /> Histórico
        </label>
        <button className="btn-secundario">Filtrar</button>
      </form>

      {ocorrencias.length === 0 && <p className="cartao text-slate-600">Nenhuma reserva encontrada.</p>}
      {[...porDia.entries()].map(([dia, lista]) => (
        <section key={dia} className="cartao p-0">
          <h2 className="border-b border-slate-100 px-4 py-2 font-semibold">
            {DIAS_SEMANA[diaSemanaLocal(lista[0].inicioUtc)]}, {dia}
          </h2>
          <ul className="divide-y divide-slate-100">
            {lista.map((o) => (
              <li key={o.id}>
                <Link href={`/admin/reservas/${o.reservaId}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 hover:bg-slate-50">
                  <span>
                    <span className="font-mono">{horaLocal(o.inicioUtc)}–{horaLocal(o.fimUtc)}</span>{' '}
                    <strong>{codigoSala(o.sala.numero)}</strong> {o.reserva.titulo}
                    <span className="text-sm text-slate-500"> · {o.reserva.pessoa.nome}</span>
                  </span>
                  <span className={`etiqueta ${COR_STATUS[o.status]}`}>{ROTULO_STATUS[o.status as StatusOcorrencia]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

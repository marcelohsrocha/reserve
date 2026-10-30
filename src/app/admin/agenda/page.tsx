import Link from 'next/link';
import { db } from '@/lib/db';
import { DIAS_SEMANA, dataLocal, diaSemanaDaData, horaLocal, localParaUtc, somarDias } from '@/lib/tempo';
import { codigoSala } from '@/domain/sala';
import { CORES_GOOGLE } from '@/lib/cores';
import { obterConfiguracao } from '@/services/configuracao';

interface Item {
  id: string;
  inicio: Date;
  fim: Date;
  titulo: string;
  sala: string;
  cor: string;
  tipo: 'reserva' | 'bloqueio';
  status?: string;
  href?: string;
}

export default async function Agenda({ searchParams }: { searchParams: Promise<{ data?: string; modo?: string; sala?: string }> }) {
  const sp = await searchParams;
  const modo = sp.modo === 'dia' ? 'dia' : 'semana';
  const base = sp.data && /^\d{4}-\d{2}-\d{2}$/.test(sp.data) ? sp.data : dataLocal(new Date());
  const primeiro = modo === 'dia' ? base : somarDias(base, -diaSemanaDaData(base));
  const nDias = modo === 'dia' ? 1 : 7;
  const dias = Array.from({ length: nDias }, (_, i) => somarDias(primeiro, i));
  const inicio = localParaUtc(primeiro, '00:00');
  const fim = localParaUtc(somarDias(primeiro, nDias), '00:00');

  const [salas, cores, cfg] = await Promise.all([
    db.sala.findMany({ orderBy: { numero: 'asc' } }),
    db.corAndar.findMany(),
    obterConfiguracao(),
  ]);
  const sala = salas.find((s) => s.id === sp.sala);
  const corAndar = new Map(cores.map((c) => [c.andar, c.colorId]));
  const hex = (andar: string) => CORES_GOOGLE[corAndar.get(andar) ?? cfg.corPadrao]?.hex ?? '#616161';

  const [ocorrencias, bloqueios] = await Promise.all([
    db.ocorrencia.findMany({
      where: { inicioUtc: { lt: fim }, fimUtc: { gt: inicio }, status: { not: 'CANCELADA' }, ...(sala && { salaId: sala.id }) },
      include: { sala: true, reserva: true },
    }),
    db.bloqueio.findMany({ where: { ativo: true, inicioUtc: { lt: fim }, fimUtc: { gt: inicio }, ...(sala && { salaId: sala.id }) }, include: { sala: true } }),
  ]);

  const itens: Item[] = [
    ...ocorrencias.map((o) => ({
      id: o.id, inicio: o.inicioUtc, fim: o.fimUtc, titulo: o.reserva.titulo, sala: codigoSala(o.sala.numero),
      cor: hex(o.sala.andar), tipo: 'reserva' as const, status: o.status, href: `/admin/reservas/${o.reservaId}`,
    })),
    ...bloqueios.map((b) => ({
      id: b.id, inicio: b.inicioUtc, fim: b.fimUtc, titulo: `BLOQUEADA – ${b.motivo}`, sala: codigoSala(b.sala.numero),
      cor: '#64748b', tipo: 'bloqueio' as const, href: `/admin/salas/${b.salaId}`,
    })),
  ].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  // Um item de vários dias (ex.: bloqueio) aparece em cada dia que ele cobre.
  const doDia = (d: string) => {
    const i = localParaUtc(d, '00:00');
    const f = localParaUtc(somarDias(d, 1), '00:00');
    return itens.filter((x) => x.inicio < f && x.fim > i);
  };

  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ modo, data: base, ...(sala && { sala: sala.id }), ...extra })}`;
  const passo = modo === 'dia' ? 1 : 7;
  const hoje = dataLocal(new Date());

  return (
    <div className="space-y-4">
      <h1 className="titulo-pagina mb-0">Agenda</h1>
      <div className="flex flex-wrap items-end gap-2">
        <Link href={q({ data: somarDias(base, -passo) })} className="btn-secundario">←</Link>
        <Link href={q({ data: hoje })} className="btn-secundario">Hoje</Link>
        <Link href={q({ data: somarDias(base, passo) })} className="btn-secundario">→</Link>
        <Link href={q({ modo: 'semana' })} className={modo === 'semana' ? 'btn-primario' : 'btn-secundario'}>Semana</Link>
        <Link href={q({ modo: 'dia' })} className={modo === 'dia' ? 'btn-primario' : 'btn-secundario'}>Dia</Link>
        <form className="flex gap-2">
          <input type="hidden" name="modo" value={modo} />
          <input type="hidden" name="data" value={base} />
          <select name="sala" defaultValue={sala?.id ?? ''} className="campo">
            <option value="">Todas as salas</option>
            {salas.map((s) => <option key={s.id} value={s.id}>{codigoSala(s.numero)} – {s.nome}{s.ativa ? '' : ' (desativada)'}</option>)}
          </select>
          <button className="btn-secundario">Filtrar</button>
        </form>
      </div>

      <div className={`grid gap-2 ${modo === 'semana' ? 'md:grid-cols-7' : ''}`}>
        {dias.map((d) => (
          <section key={d} className={`cartao min-h-24 p-2 ${d === hoje ? 'border-igreja ring-1 ring-igreja/30' : ''}`}>
            <Link href={`?${new URLSearchParams({ modo: 'dia', data: d, ...(sala && { sala: sala.id }) })}`} className="mb-2 block text-sm font-semibold">
              {DIAS_SEMANA[diaSemanaDaData(d)]} {d.slice(8)}/{d.slice(5, 7)}
            </Link>
            <ul className="space-y-1">
              {doDia(d).map((x) => {
                const conteudo = (
                  <>
                    <span className="font-mono">{horaLocal(x.inicio)}–{horaLocal(x.fim)}</span> <strong>{x.sala}</strong> {x.titulo}
                  </>
                );
                const estilo = { borderLeftColor: x.cor };
                const cls = `block rounded border-l-4 bg-slate-50 px-2 py-1 text-xs ${x.status === 'NAO_COMPARECEU' || x.status === 'FINALIZADA' ? 'opacity-60' : ''} ${x.tipo === 'bloqueio' ? 'bg-slate-200' : ''}`;
                return (
                  <li key={`${x.tipo}-${x.id}`}>
                    {x.href ? <Link href={x.href} className={`${cls} hover:bg-slate-100`} style={estilo}>{conteudo}</Link> : <div className={cls} style={estilo}>{conteudo}</div>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

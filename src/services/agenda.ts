import { db } from '@/lib/db';
import { dataLocal, localParaUtc, somarDias } from '@/lib/tempo';
import { semPrefixo } from '@/domain/prefixo';

export interface SalaResumo {
  id: string;
  numero: number;
  nome: string;
  andar: string;
  ativa: boolean;
}

/** Item da agenda normalizado (reserva, bloqueio ou evento externo do Google). */
export interface ItemAgenda {
  chave: string;
  tipo: 'reserva' | 'bloqueio' | 'google';
  inicio: Date;
  fim: Date;
  titulo: string;
  responsavel: string | null;
  status: string | null;
  sala: SalaResumo;
  ocorrenciaId?: string;
  reservaId?: string;
}

/** Tudo que ocupa salas na janela (sem canceladas), opcionalmente de uma sala só. */
export async function itensAgenda(inicio: Date, fim: Date, salaId?: string): Promise<ItemAgenda[]> {
  const salas = await db.sala.findMany({ where: salaId ? { id: salaId } : {} });
  const porNumero = new Map(salas.map((s) => [s.numero, s]));
  const resumo = (s: (typeof salas)[number]): SalaResumo => ({ id: s.id, numero: s.numero, nome: s.nome, andar: s.andar, ativa: s.ativa });

  const [ocorrencias, bloqueios, externos] = await Promise.all([
    db.ocorrencia.findMany({
      where: { inicioUtc: { lt: fim }, fimUtc: { gt: inicio }, status: { not: 'CANCELADA' }, ...(salaId && { salaId }) },
      include: { sala: true, reserva: { include: { pessoa: { select: { nome: true } } } } },
    }),
    db.bloqueio.findMany({
      where: { ativo: true, inicioUtc: { lt: fim }, fimUtc: { gt: inicio }, ...(salaId && { salaId }) },
      include: { sala: true },
    }),
    db.eventoGoogle.findMany({
      where: { estado: 'VINCULADO', tipo: 'externo', inicioUtc: { lt: fim }, fimUtc: { gt: inicio }, salaNumero: { in: [...porNumero.keys()] } },
    }),
  ]);

  const itens: ItemAgenda[] = [
    ...ocorrencias.map((o) => ({
      chave: `o:${o.id}`,
      tipo: 'reserva' as const,
      inicio: o.inicioUtc,
      fim: o.fimUtc,
      titulo: o.reserva.titulo,
      responsavel: o.reserva.pessoa.nome,
      status: o.status,
      sala: resumo(o.sala),
      ocorrenciaId: o.id,
      reservaId: o.reservaId,
    })),
    ...bloqueios.map((b) => ({
      chave: `b:${b.id}`,
      tipo: 'bloqueio' as const,
      inicio: b.inicioUtc,
      fim: b.fimUtc,
      titulo: `Bloqueada – ${b.motivo}`,
      responsavel: null,
      status: null,
      sala: resumo(b.sala),
    })),
    ...externos.map((e) => ({
      chave: `g:${e.googleEventId}`,
      tipo: 'google' as const,
      inicio: e.inicioUtc,
      fim: e.fimUtc,
      titulo: semPrefixo(e.titulo) || e.titulo,
      responsavel: 'Google Agenda',
      status: null,
      sala: resumo(porNumero.get(e.salaNumero!)!),
    })),
  ];
  return itens.sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.sala.numero - b.sala.numero);
}

/** Itens que tocam o dia local `data` (AAAA-MM-DD). */
export function doDia(itens: ItemAgenda[], data: string) {
  const i = localParaUtc(data, '00:00');
  const f = localParaUtc(somarDias(data, 1), '00:00');
  return itens.filter((x) => x.inicio < f && x.fim > i);
}

/** Quantidade de itens por dia local no intervalo [primeiro, primeiro + nDias). */
export async function marcadoresDoPeriodo(primeiro: string, nDias: number, salaId?: string) {
  const itens = await itensAgenda(localParaUtc(primeiro, '00:00'), localParaUtc(somarDias(primeiro, nDias), '00:00'), salaId);
  const contagem = new Map<string, number>();
  for (let k = 0; k < nDias; k++) {
    const d = somarDias(primeiro, k);
    const n = doDia(itens, d).length;
    if (n) contagem.set(d, n);
  }
  return contagem;
}

export const hojeLocal = () => dataLocal(new Date());

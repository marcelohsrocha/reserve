import { db } from '@/lib/db';
import { situacaoSala, type ItemAgenda, type EstadoSala } from '@/domain/painel';
import { codigoSala } from '@/domain/sala';
import { STATUS_ATIVOS } from '@/domain/status';
import { paraVisao, VISAO_ANONIMA, type Visao } from '@/domain/privacidade';

const HORIZONTE_MS = 14 * 86_400_000;

export interface ItemPainel {
  tipo: ItemAgenda['tipo'];
  titulo: string;
  responsavel: string | null;
  inicio: string;
  fim: string;
  status?: string;
}

export interface CardSala {
  id: string;
  numero: number;
  codigo: string;
  nome: string;
  andar: string;
  estado: EstadoSala;
  atual: ItemPainel | null;
  proximo: ItemPainel | null;
  livreAte: string | null;
}

export interface DadosPainel {
  agora: string;
  andares: { andar: string; salas: CardSala[] }[];
  total: number;
}

const serial = (item: ItemAgenda | null, v: Visao): ItemPainel | null => {
  if (!item) return null;
  const i = paraVisao(item, v);
  return {
    tipo: i.tipo,
    titulo: i.titulo,
    responsavel: i.responsavel ?? null,
    inicio: i.inicio.toISOString(),
    fim: i.fim.toISOString(),
    status: i.status,
  };
};

/**
 * Situação de todas as salas ATIVAS agora, agrupadas por andar e ordenadas pelo número.
 * `visao`: membros veem título/responsável só das próprias reservas (ver domain/privacidade).
 */
export async function obterPainel(agora = new Date(), visao: Visao = VISAO_ANONIMA): Promise<DadosPainel> {
  const ate = new Date(agora.getTime() + HORIZONTE_MS);
  const salas = await db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } });
  const [ocorrencias, bloqueios] = await Promise.all([
    db.ocorrencia.findMany({
      where: { status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora }, inicioUtc: { lt: ate }, salaId: { in: salas.map((s) => s.id) } },
      include: { reserva: { include: { pessoa: { select: { nome: true } } } } },
    }),
    db.bloqueio.findMany({ where: { ativo: true, fimUtc: { gt: agora }, inicioUtc: { lt: ate } } }),
  ]);

  const porSala = new Map<string, ItemAgenda[]>(salas.map((s) => [s.id, []]));
  for (const o of ocorrencias) {
    porSala.get(o.salaId)?.push({
      tipo: 'reserva',
      inicio: o.inicioUtc,
      fim: o.fimUtc,
      titulo: o.reserva.titulo,
      responsavel: o.reserva.pessoa.nome,
      pessoaId: o.reserva.pessoaId,
      status: o.status,
    });
  }
  for (const b of bloqueios) {
    porSala.get(b.salaId)?.push({ tipo: 'bloqueio', inicio: b.inicioUtc, fim: b.fimUtc, titulo: b.motivo });
  }

  const grupos = new Map<string, CardSala[]>();
  for (const s of salas) {
    const sit = situacaoSala(porSala.get(s.id)!, agora);
    const card: CardSala = {
      id: s.id,
      numero: s.numero,
      codigo: codigoSala(s.numero),
      nome: s.nome,
      andar: s.andar,
      estado: sit.estado,
      atual: serial(sit.atual, visao),
      proximo: serial(sit.proximo, visao),
      livreAte: sit.livreAte?.toISOString() ?? null,
    };
    if (!grupos.has(s.andar)) grupos.set(s.andar, []);
    grupos.get(s.andar)!.push(card);
  }
  const andares = [...grupos.entries()]
    .sort(([, a], [, b]) => a[0].numero - b[0].numero)
    .map(([andar, salas]) => ({ andar, salas }));
  return { agora: agora.toISOString(), andares, total: salas.length };
}

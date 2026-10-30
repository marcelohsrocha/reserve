import { db } from '@/lib/db';
import { diaSemanaLocal, formatarLocal } from '@/lib/tempo';
import { DIAS_SEMANA } from '@/lib/tempo';
import { itensAgenda } from './agenda';

const DIA_MS = 86_400_000;
/** Horário considerado "útil" para calcular a taxa de ocupação: 07h às 22h. */
export const HORAS_UTEIS_POR_DIA = 15;

export interface OcupacaoSala {
  salaId: string;
  numero: number;
  nome: string;
  andar: string;
  horas: number;
  eventos: number;
  percentual: number;
  pico: string | null; // ex.: "Ter 19h"
}

/**
 * Salas com os horários mais lotados: horas ocupadas por reservas (exceto canceladas e
 * não comparecidas) e eventos do Google na janela de `dias` antes e depois de `agora`.
 */
export async function ocupacaoDasSalas(agora = new Date(), dias = 30): Promise<OcupacaoSala[]> {
  const inicio = new Date(agora.getTime() - dias * DIA_MS);
  const fim = new Date(agora.getTime() + dias * DIA_MS);
  const [salas, itens] = await Promise.all([
    db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } }),
    itensAgenda(inicio, fim),
  ]);
  const capacidade = 2 * dias * HORAS_UTEIS_POR_DIA;
  const res = salas.map((s) => {
    const daSala = itens.filter((i) => i.sala.id === s.id && i.tipo !== 'bloqueio' && i.status !== 'NAO_COMPARECEU');
    const picos = new Map<string, number>();
    let horas = 0;
    for (const i of daSala) {
      const ini = Math.max(i.inicio.getTime(), inicio.getTime());
      const f = Math.min(i.fim.getTime(), fim.getTime());
      horas += Math.max(0, f - ini) / 3_600_000;
      const chave = `${DIAS_SEMANA[diaSemanaLocal(i.inicio)]} ${formatarLocal(i.inicio, 'H')}h`;
      picos.set(chave, (picos.get(chave) ?? 0) + 1);
    }
    const pico = [...picos.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      salaId: s.id,
      numero: s.numero,
      nome: s.nome,
      andar: s.andar,
      horas: Math.round(horas * 10) / 10,
      eventos: daSala.length,
      percentual: Math.min(100, Math.round((horas / capacidade) * 100)),
      pico: pico && pico[1] > 1 ? pico[0] : null,
    };
  });
  return res.sort((a, b) => b.horas - a.horas || a.numero - b.numero);
}

export interface UsoPessoa {
  pessoaId: string;
  nome: string;
  usos: number; // ocorrências realizadas (confirmadas/finalizadas) ou agendadas na janela
  confirmadas: number; // com check-in
  faltas: number; // não compareceu
}

/** Ranking das pessoas que mais utilizam as salas nos últimos `dias` (inclui o que já está agendado até hoje). */
export async function rankingPessoas(agora = new Date(), dias = 90, limite = 8): Promise<UsoPessoa[]> {
  const ocorrencias = await db.ocorrencia.findMany({
    where: { inicioUtc: { gte: new Date(agora.getTime() - dias * DIA_MS), lte: agora }, status: { not: 'CANCELADA' } },
    select: { status: true, checkinEm: true, reserva: { select: { pessoa: { select: { id: true, nome: true } } } } },
  });
  const mapa = new Map<string, UsoPessoa>();
  for (const o of ocorrencias) {
    const p = o.reserva.pessoa;
    const u = mapa.get(p.id) ?? { pessoaId: p.id, nome: p.nome, usos: 0, confirmadas: 0, faltas: 0 };
    if (o.status === 'NAO_COMPARECEU') u.faltas++;
    else u.usos++;
    if (o.checkinEm) u.confirmadas++;
    mapa.set(p.id, u);
  }
  return [...mapa.values()].sort((a, b) => b.usos - a.usos || a.faltas - b.faltas || a.nome.localeCompare(b.nome)).slice(0, limite);
}

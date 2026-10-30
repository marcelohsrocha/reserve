import { db } from '@/lib/db';
import { agenda } from '@/integrations/google';
import { deduplicarOcupacoes, encontrarConflitos, type Conflito, type Ocupacao } from '@/domain/conflito';
import type { Intervalo } from '@/domain/ocorrencias';
import { semPrefixo } from '@/domain/prefixo';
import { STATUS_ATIVOS } from '@/domain/status';

export interface Ignorar {
  ocorrenciaIds?: Set<string>;
  bloqueioIds?: Set<string>;
}

/**
 * Tudo que ocupa salas na janela: ocorrências ativas e bloqueios locais + eventos do sistema na
 * agenda única consultados AO VIVO no Google (pela propriedade privada `salaNumero`), para pegar
 * qualquer divergência ainda não sincronizada. Eventos sem identificação não bloqueiam nada.
 */
export async function ocupacoesNaJanela(inicio: Date, fim: Date, ignorar: Ignorar = {}): Promise<Ocupacao[]> {
  const [ocorrencias, bloqueios, salasAtivas, eventos] = await Promise.all([
    db.ocorrencia.findMany({
      where: { status: { in: STATUS_ATIVOS }, inicioUtc: { lt: fim }, fimUtc: { gt: inicio } },
      include: { sala: true, reserva: true },
    }),
    db.bloqueio.findMany({ where: { ativo: true, inicioUtc: { lt: fim }, fimUtc: { gt: inicio } }, include: { sala: true } }),
    db.sala.findMany({ where: { ativa: true }, select: { numero: true } }),
    agenda().listarJanela(inicio, fim),
  ]);
  const ativas = new Set(salasAtivas.map((s) => s.numero));
  // Ocorrências locais que não estão mais ativas (canceladas, não comparecidas) não devem bloquear
  // mesmo que o evento correspondente ainda exista no Google por um instante.
  const idsGoogleInativos = new Set(
    (
      await db.ocorrencia.findMany({
        where: { status: { notIn: STATUS_ATIVOS }, googleEventId: { in: eventos.map((e) => e.id) } },
        select: { googleEventId: true },
      })
    ).map((o) => o.googleEventId),
  );

  const lista: Ocupacao[] = [];
  for (const o of ocorrencias) {
    if (ignorar.ocorrenciaIds?.has(o.id)) continue;
    lista.push({
      salaNumero: o.sala.numero,
      inicio: o.inicioUtc,
      fim: o.fimUtc,
      titulo: o.reserva.titulo,
      origem: 'reserva',
      ocorrenciaId: o.id,
      googleEventId: o.googleEventId,
    });
  }
  for (const b of bloqueios) {
    if (ignorar.bloqueioIds?.has(b.id)) continue;
    lista.push({
      salaNumero: b.sala.numero,
      inicio: b.inicioUtc,
      fim: b.fimUtc,
      titulo: `BLOQUEADA – ${b.motivo}`,
      origem: 'bloqueio',
      bloqueioId: b.id,
      googleEventId: b.googleEventId,
    });
  }
  for (const e of eventos) {
    if (idsGoogleInativos.has(e.id)) continue;
    if (e.privado.ocorrenciaId && ignorar.ocorrenciaIds?.has(e.privado.ocorrenciaId)) continue;
    if (e.privado.bloqueioId && ignorar.bloqueioIds?.has(e.privado.bloqueioId)) continue;
    // Só eventos do próprio sistema ocupam salas; os demais são apagados pela sincronização.
    if (!e.privado.ocorrenciaId && !e.privado.bloqueioId) continue;
    const numero = Number(e.privado.salaNumero);
    if (!numero || !ativas.has(numero)) continue;
    lista.push({
      salaNumero: numero,
      inicio: e.inicio,
      fim: e.fim,
      titulo: semPrefixo(e.titulo) || e.titulo,
      origem: e.privado.bloqueioId ? 'bloqueio' : 'reserva',
      ocorrenciaId: e.privado.ocorrenciaId ?? null,
      bloqueioId: e.privado.bloqueioId ?? null,
      googleEventId: e.id,
    });
  }
  return deduplicarOcupacoes(lista);
}

function envoltoria(pedidos: Intervalo[]): Intervalo {
  return {
    inicio: new Date(Math.min(...pedidos.map((p) => p.inicio.getTime()))),
    fim: new Date(Math.max(...pedidos.map((p) => p.fim.getTime()))),
  };
}

/** Conflitos dos intervalos pedidos com a sala `salaNumero` na agenda única. */
export async function verificarConflitos(salaNumero: number, pedidos: Intervalo[], ignorar: Ignorar = {}): Promise<Conflito[]> {
  if (pedidos.length === 0) return [];
  const { inicio, fim } = envoltoria(pedidos);
  return encontrarConflitos(salaNumero, pedidos, await ocupacoesNaJanela(inicio, fim, ignorar));
}

/** Salas ativas livres em todo o intervalo pedido. */
export async function salasLivres(intervalo: Intervalo) {
  const [salas, ocupacoes] = await Promise.all([
    db.sala.findMany({ where: { ativa: true }, orderBy: { numero: 'asc' } }),
    ocupacoesNaJanela(intervalo.inicio, intervalo.fim),
  ]);
  return salas.filter((s) => encontrarConflitos(s.numero, [intervalo], ocupacoes).length === 0);
}

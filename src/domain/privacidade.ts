/**
 * Privacidade entre membros: quem reserva precisa saber ONDE e QUANDO há sala livre,
 * não QUEM está usando. Administradores veem tudo; membros veem os detalhes (título e
 * responsável) só das próprias reservas. As dos outros aparecem apenas como "Reservado"
 * com o horário. Bloqueios (reforma, manutenção) não são pessoais e continuam visíveis.
 */

export const TITULO_OCULTO = 'Reservado';

/** Quem está olhando. `id: null` = visitante sem login (vê tudo oculto). */
export interface Visao {
  id: string | null;
  admin: boolean;
}

export const VISAO_ANONIMA: Visao = { id: null, admin: false };

export function podeVerDetalhes(v: Visao, donoId: string | null | undefined): boolean {
  return v.admin || (Boolean(donoId) && donoId === v.id);
}

interface ItemComDono {
  tipo: string;
  titulo: string;
  responsavel?: string | null;
  pessoaId?: string | null;
}

/** Devolve o item como `v` pode vê-lo (cópia; o original não muda). */
export function paraVisao<T extends ItemComDono>(item: T, v: Visao): T {
  if (item.tipo !== 'reserva' || podeVerDetalhes(v, item.pessoaId)) return item;
  return { ...item, titulo: TITULO_OCULTO, responsavel: null };
}

export function listaParaVisao<T extends ItemComDono>(itens: T[], v: Visao): T[] {
  return itens.map((i) => paraVisao(i, v));
}

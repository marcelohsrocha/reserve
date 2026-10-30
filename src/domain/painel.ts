import { ANTECEDENCIA_CHECKIN_MIN } from './status';
import { minutos } from '@/lib/tempo';

export type EstadoSala = 'LIVRE' | 'RESERVADA' | 'OCUPADA' | 'BLOQUEADA';

export interface ItemAgenda {
  tipo: 'reserva' | 'bloqueio';
  inicio: Date;
  fim: Date;
  titulo: string;
  responsavel?: string | null;
  status?: string; // status da ocorrência (reservas)
}

export interface SituacaoSala {
  estado: EstadoSala;
  atual: ItemAgenda | null;
  proximo: ItemAgenda | null;
  livreAte: Date | null; // null = livre pelo resto do período consultado
}

/**
 * Determina a situação de uma sala no instante `agora` a partir dos itens da agenda dela.
 * Itens já terminados ou de reservas canceladas/finalizadas/não comparecidas devem vir filtrados.
 */
export function situacaoSala(itens: ItemAgenda[], agora: Date): SituacaoSala {
  const ordenados = [...itens].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const vigentes = ordenados.filter((i) => i.inicio <= agora && i.fim > agora);

  const bloqueio = vigentes.find((i) => i.tipo === 'bloqueio');
  const reservaPre = ordenados.find(
    (i) =>
      i.tipo === 'reserva' &&
      i.fim > agora &&
      i.inicio.getTime() - minutos(ANTECEDENCIA_CHECKIN_MIN) <= agora.getTime() &&
      (i.inicio <= agora || i.status === 'CONFIRMADA'),
  );

  let estado: EstadoSala = 'LIVRE';
  let atual: ItemAgenda | null = null;
  if (bloqueio) {
    estado = 'BLOQUEADA';
    atual = bloqueio;
  } else if (reservaPre) {
    estado = reservaPre.status === 'CONFIRMADA' ? 'OCUPADA' : 'RESERVADA';
    atual = reservaPre;
  }

  const futuros = ordenados.filter((i) => i.inicio > agora && i !== atual);
  const proximo = futuros[0] ?? null;
  return { estado, atual, proximo, livreAte: estado === 'LIVRE' ? (proximo?.inicio ?? null) : null };
}

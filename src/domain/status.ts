import { minutos } from '@/lib/tempo';

export const STATUS = ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA', 'FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'] as const;
export type StatusOcorrencia = (typeof STATUS)[number];

export const STATUS_ATIVOS: StatusOcorrencia[] = ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'];
export const STATUS_TERMINAIS: StatusOcorrencia[] = ['FINALIZADA', 'CANCELADA', 'NAO_COMPARECEU'];

export const ROTULO_STATUS: Record<StatusOcorrencia, string> = {
  AGENDADA: 'Agendada',
  EM_ANDAMENTO: 'Em andamento',
  CONFIRMADA: 'Confirmada',
  FINALIZADA: 'Finalizada',
  CANCELADA: 'Cancelada',
  NAO_COMPARECEU: 'Não compareceu',
};

/** Antecedência máxima para considerar uma ocorrência "vigente" no check-in. */
export const ANTECEDENCIA_CHECKIN_MIN = 15;

export interface RegrasStatus {
  toleranciaCheckinMin: number;
  liberacaoAutomatica: boolean;
}

/**
 * Calcula o status que a ocorrência deve ter no instante `agora`.
 * Retorna null quando não há mudança.
 */
export function proximoStatus(
  o: { status: string; inicioUtc: Date; fimUtc: Date; checkinEm: Date | null },
  agora: Date,
  regras: RegrasStatus,
): StatusOcorrencia | null {
  const atual = o.status as StatusOcorrencia;
  if (STATUS_TERMINAIS.includes(atual)) return null;

  if (agora >= o.fimUtc) return 'FINALIZADA';

  let novo: StatusOcorrencia = atual;
  if (novo === 'AGENDADA' && agora >= o.inicioUtc) novo = 'EM_ANDAMENTO';
  if (
    novo === 'EM_ANDAMENTO' &&
    !o.checkinEm &&
    regras.liberacaoAutomatica &&
    agora.getTime() >= o.inicioUtc.getTime() + minutos(regras.toleranciaCheckinMin)
  ) {
    novo = 'NAO_COMPARECEU';
  }
  return novo === atual ? null : novo;
}

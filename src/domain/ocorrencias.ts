import { diaSemanaDaData, localParaUtc, somarDias } from '@/lib/tempo';

export const MAX_OCORRENCIAS = 400;

export interface Recorrencia {
  dataInicio: string; // AAAA-MM-DD
  dataFim: string; // AAAA-MM-DD
  horaInicio: string; // HH:MM
  horaFim: string; // HH:MM
  diasSemana?: number[] | null; // 0 = domingo; vazio/null = todos os dias
}

export interface Intervalo {
  inicio: Date;
  fim: Date;
}

export class RecorrenciaInvalida extends Error {}

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Gera uma ocorrência por dia no intervalo [dataInicio, dataFim], sempre no mesmo horário,
 * opcionalmente filtrando por dias da semana.
 */
export function gerarOcorrencias(r: Recorrencia): Intervalo[] {
  if (!DATA.test(r.dataInicio) || !DATA.test(r.dataFim)) throw new RecorrenciaInvalida('Data inválida.');
  if (!HORA.test(r.horaInicio) || !HORA.test(r.horaFim)) throw new RecorrenciaInvalida('Horário inválido.');
  if (r.dataFim < r.dataInicio) throw new RecorrenciaInvalida('A data final é anterior à data inicial.');
  if (r.horaFim <= r.horaInicio) throw new RecorrenciaInvalida('O horário final deve ser depois do horário inicial.');

  const filtro = r.diasSemana && r.diasSemana.length > 0 ? new Set(r.diasSemana) : null;
  const res: Intervalo[] = [];
  for (let dia = r.dataInicio; dia <= r.dataFim; dia = somarDias(dia, 1)) {
    if (filtro && !filtro.has(diaSemanaDaData(dia))) continue;
    res.push({ inicio: localParaUtc(dia, r.horaInicio), fim: localParaUtc(dia, r.horaFim) });
    if (res.length > MAX_OCORRENCIAS) {
      throw new RecorrenciaInvalida(`Limite de ${MAX_OCORRENCIAS} ocorrências por reserva excedido.`);
    }
  }
  if (res.length === 0) throw new RecorrenciaInvalida('Nenhum dia do intervalo corresponde aos dias da semana escolhidos.');
  return res;
}

export function parseDiasSemana(s: string | null | undefined): number[] | null {
  if (!s) return null;
  const dias = s.split(',').map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return dias.length ? dias : null;
}

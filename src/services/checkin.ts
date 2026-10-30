import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { registrarTentativa } from '@/lib/limite-taxa';
import { mascararTelefone, ultimos4 } from '@/lib/telefone';
import { minutos } from '@/lib/tempo';
import { ANTECEDENCIA_CHECKIN_MIN, STATUS_ATIVOS } from '@/domain/status';
import { codigoSala } from '@/domain/sala';

export type SituacaoCheckin =
  | { tipo: 'INDISPONIVEL' }
  | { tipo: 'BLOQUEADA'; sala: SalaResumo; motivo: string; ate: Date }
  | { tipo: 'LIVRE'; sala: SalaResumo; proximo: { titulo: string; inicio: Date; fim: Date } | null }
  | {
      tipo: 'RESERVA';
      sala: SalaResumo;
      ocorrencia: { id: string; titulo: string; inicio: Date; fim: Date; status: string; checkinEm: Date | null };
      responsavel: string;
      telefoneMascarado: string;
    };

interface SalaResumo {
  codigo: string;
  nome: string;
  andar: string;
}

/** O que a página do QR mostra para a sala no instante `agora`. */
export async function situacaoCheckin(qrToken: string, agora = new Date()): Promise<SituacaoCheckin> {
  const sala = await db.sala.findUnique({ where: { qrToken } });
  // QR de sala desativada ou regenerado (token antigo não existe mais).
  if (!sala || !sala.ativa) return { tipo: 'INDISPONIVEL' };
  const resumo = { codigo: codigoSala(sala.numero), nome: sala.nome, andar: sala.andar };

  const bloqueio = await db.bloqueio.findFirst({
    where: { salaId: sala.id, ativo: true, inicioUtc: { lte: agora }, fimUtc: { gt: agora } },
  });
  if (bloqueio) return { tipo: 'BLOQUEADA', sala: resumo, motivo: bloqueio.motivo, ate: bloqueio.fimUtc };

  // Vigente: começa em até 15 min ou já está em andamento.
  const vigente = await db.ocorrencia.findFirst({
    where: {
      salaId: sala.id,
      status: { in: STATUS_ATIVOS },
      inicioUtc: { lte: new Date(agora.getTime() + minutos(ANTECEDENCIA_CHECKIN_MIN)) },
      fimUtc: { gt: agora },
    },
    orderBy: { inicioUtc: 'asc' },
    include: { reserva: { include: { pessoa: true } } },
  });
  if (vigente) {
    return {
      tipo: 'RESERVA',
      sala: resumo,
      ocorrencia: {
        id: vigente.id,
        titulo: vigente.reserva.titulo,
        inicio: vigente.inicioUtc,
        fim: vigente.fimUtc,
        status: vigente.status,
        checkinEm: vigente.checkinEm,
      },
      responsavel: vigente.reserva.pessoa.nome,
      telefoneMascarado: mascararTelefone(vigente.reserva.pessoa.telefoneE164),
    };
  }

  const proxOc = await db.ocorrencia.findFirst({
    where: { salaId: sala.id, status: { in: STATUS_ATIVOS }, inicioUtc: { gt: agora } },
    orderBy: { inicioUtc: 'asc' },
    include: { reserva: true },
  });
  const candidatos = proxOc ? [{ titulo: proxOc.reserva.titulo, inicio: proxOc.inicioUtc, fim: proxOc.fimUtc }] : [];
  return { tipo: 'LIVRE', sala: resumo, proximo: candidatos[0] ?? null };
}

export type ResultadoCheckin =
  | { ok: true; checkinEm: Date }
  | { ok: false; motivo: 'LIMITE' | 'DIGITOS' | 'INDISPONIVEL' | 'JA_CONFIRMADA' };

/** Confirma presença com os 4 últimos dígitos do telefone do responsável (máx. 5 tentativas/IP/10 min). */
export async function confirmarCheckin(
  qrToken: string,
  digitos: string,
  ip: string,
  agora = new Date(),
): Promise<ResultadoCheckin> {
  if (!registrarTentativa(`checkin:${ip}`, 5, 10 * 60_000, agora.getTime())) return { ok: false, motivo: 'LIMITE' };
  const sit = await situacaoCheckin(qrToken, agora);
  if (sit.tipo !== 'RESERVA') return { ok: false, motivo: 'INDISPONIVEL' };
  if (sit.ocorrencia.status === 'CONFIRMADA') return { ok: false, motivo: 'JA_CONFIRMADA' };

  const o = await db.ocorrencia.findUniqueOrThrow({
    where: { id: sit.ocorrencia.id },
    include: { reserva: { include: { pessoa: true } } },
  });
  if (digitos.replace(/\D/g, '') !== ultimos4(o.reserva.pessoa.telefoneE164)) return { ok: false, motivo: 'DIGITOS' };

  const r = await db.ocorrencia.updateMany({
    where: { id: o.id, status: { in: ['AGENDADA', 'EM_ANDAMENTO'] } },
    data: { status: 'CONFIRMADA', checkinEm: agora },
  });
  if (r.count === 0) return { ok: false, motivo: 'INDISPONIVEL' };
  await auditar(`checkin:${ip}`, 'checkin', 'ocorrencia', o.id, { sala: sit.sala.codigo });
  publicar('checkin', { ocorrenciaId: o.id });
  return { ok: true, checkinEm: agora };
}

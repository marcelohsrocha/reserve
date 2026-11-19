import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { registrarTentativa } from '@/lib/limite-taxa';
import { mascararTelefone, ultimos4 } from '@/lib/telefone';
import { minutos } from '@/lib/tempo';
import { ANTECEDENCIA_CHECKIN_MIN, STATUS_ATIVOS } from '@/domain/status';
import { codigoSala } from '@/domain/sala';
import { liberarOcorrencia } from './reservas';
import { ErroNegocio } from './erros';

export type SituacaoCheckin =
  | { tipo: 'INDISPONIVEL' }
  | { tipo: 'BLOQUEADA'; sala: SalaResumo; motivo: string; ate: Date }
  | { tipo: 'LIVRE'; sala: SalaResumo; proximo: { titulo: string; inicio: Date; fim: Date } | null }
  | {
      tipo: 'RESERVA';
      sala: SalaResumo;
      ocorrencia: { id: string; titulo: string; inicio: Date; fim: Date; status: string; checkinEm: Date | null };
      responsavel: string;
      responsavelId: string;
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
      responsavelId: vigente.reserva.pessoaId,
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
  | { ok: false; motivo: 'LIMITE' | 'DIGITOS' | 'INDISPONIVEL' | 'JA_CONFIRMADA' | 'SEM_PERMISSAO' | 'NAO_COMECOU' };

/** Como a pessoa se identifica na porta: 4 dígitos do telefone ou sessão logada (1 toque). */
export type Credencial = { digitos: string; ip: string } | { pessoaId: string };

/** Quem está logado pode agir com 1 toque se for o responsável da reserva ou administrador. */
export async function podeAgirSemDigitos(pessoaId: string | null | undefined, responsavelId: string) {
  if (!pessoaId) return false;
  const p = await db.pessoa.findUnique({ where: { id: pessoaId } });
  if (!p || !p.ativo) return false;
  return p.id === responsavelId || p.papel === 'ADMIN';
}

/**
 * Confere a credencial contra a reserva vigente. Dígitos: máx. 5 tentativas/IP/10 min.
 * Devolve quem agiu (para a auditoria) ou o motivo da recusa.
 */
async function autorizar(qrToken: string, cred: Credencial, agora: Date) {
  if ('digitos' in cred && !registrarTentativa(`checkin:${cred.ip}`, 5, 10 * 60_000, agora.getTime())) {
    return { erro: 'LIMITE' as const };
  }
  const sit = await situacaoCheckin(qrToken, agora);
  if (sit.tipo !== 'RESERVA') return { erro: 'INDISPONIVEL' as const };
  if ('digitos' in cred) {
    const dono = await db.pessoa.findUnique({ where: { id: sit.responsavelId } });
    if (cred.digitos.replace(/\D/g, '') !== ultimos4(dono?.telefoneE164 ?? null)) return { erro: 'DIGITOS' as const };
    return { sit, quem: `checkin:${cred.ip}` };
  }
  if (!(await podeAgirSemDigitos(cred.pessoaId, sit.responsavelId))) return { erro: 'SEM_PERMISSAO' as const };
  const p = await db.pessoa.findUniqueOrThrow({ where: { id: cred.pessoaId } });
  return { sit, quem: p.email ?? p.id };
}

/** Confirma presença na reserva vigente da sala. */
export async function confirmarCheckin(qrToken: string, cred: Credencial, agora = new Date()): Promise<ResultadoCheckin> {
  const a = await autorizar(qrToken, cred, agora);
  if ('erro' in a) return { ok: false, motivo: a.erro! };
  const { sit, quem } = a;
  if (sit.ocorrencia.status === 'CONFIRMADA') return { ok: false, motivo: 'JA_CONFIRMADA' };
  const r = await db.ocorrencia.updateMany({
    where: { id: sit.ocorrencia.id, status: { in: ['AGENDADA', 'EM_ANDAMENTO'] } },
    data: { status: 'CONFIRMADA', checkinEm: agora },
  });
  if (r.count === 0) return { ok: false, motivo: 'INDISPONIVEL' };
  await auditar(quem, 'checkin', 'ocorrencia', sit.ocorrencia.id, { sala: sit.sala.codigo, umToque: 'pessoaId' in cred });
  publicar('checkin', { ocorrenciaId: sit.ocorrencia.id });
  return { ok: true, checkinEm: agora };
}

export type ResultadoEncerrar = { ok: true; em: Date } | { ok: false; motivo: Exclude<ResultadoCheckin, { ok: true }>['motivo'] };

/** "Encerrar agora": a atividade acabou mais cedo; a sala fica livre na hora e o evento é encurtado. */
export async function encerrarPelaPorta(qrToken: string, cred: Credencial, agora = new Date()): Promise<ResultadoEncerrar> {
  const a = await autorizar(qrToken, cred, agora);
  if ('erro' in a) return { ok: false, motivo: a.erro! };
  if (a.sit.ocorrencia.inicio > agora) return { ok: false, motivo: 'NAO_COMECOU' };
  try {
    await liberarOcorrencia(a.sit.ocorrencia.id, a.quem, agora);
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, motivo: 'INDISPONIVEL' };
    throw e;
  }
  return { ok: true, em: agora };
}

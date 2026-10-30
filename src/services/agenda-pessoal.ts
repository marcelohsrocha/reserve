import type { Ocorrencia, Pessoa, Reserva, Sala } from '@prisma/client';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { emParalelo } from '@/lib/trava';
import { agendaPessoal, tokenRevogado } from '@/integrations/google';
import { STATUS_ATIVOS } from '@/domain/status';
import { eventoPessoal } from './eventos-google';

type OcorrenciaCompleta = Ocorrencia & { sala: Sala; reserva: Reserva & { pessoa: Pessoa } };

const LIMITE = 5;

/** Token revogado/expirado: desconecta a agenda para não tentar de novo a cada alteração. */
async function desconectarPorErro(p: Pessoa, e: unknown) {
  if (!tokenRevogado(e)) return false;
  await db.pessoa.update({ where: { id: p.id }, data: { googleRefreshToken: null, agendaConectadaEm: null } });
  await auditar('sistema', 'desconectar_agenda', 'pessoa', p.id, { motivo: 'acesso revogado ou expirado no Google' });
  return true;
}

const codigo = (e: unknown) => (e as { code?: number })?.code;

async function sincronizarCopia(o: OcorrenciaCompleta) {
  const dono = o.reserva.pessoa;
  // FINALIZADA entra para refletir a liberação antecipada (fim encurtado).
  const manter = STATUS_ATIVOS.includes(o.status as never) || o.status === 'FINALIZADA';

  // Cópia na agenda de outra pessoa (responsável trocado) ou que deixou de valer: remove.
  if (o.googleEventIdPessoal && (!manter || o.pessoaAgendaId !== dono.id)) {
    const antigo = o.pessoaAgendaId === dono.id ? dono : await db.pessoa.findUnique({ where: { id: o.pessoaAgendaId ?? '' } });
    if (antigo?.googleRefreshToken) {
      try {
        await agendaPessoal(antigo).remover(o.googleEventIdPessoal);
      } catch (e) {
        if (!(await desconectarPorErro(antigo, e))) throw e;
      }
    }
    await db.ocorrencia.update({ where: { id: o.id }, data: { googleEventIdPessoal: null, pessoaAgendaId: null } });
    o.googleEventIdPessoal = null;
  }
  if (!manter || !dono.googleRefreshToken) return;

  const dados = eventoPessoal(o.sala, o.reserva, o);
  try {
    if (o.googleEventIdPessoal) {
      try {
        await agendaPessoal(dono).atualizar(o.googleEventIdPessoal, dados);
      } catch (e) {
        // O próprio usuário apagou a cópia da agenda dele: respeita e não recria.
        if (codigo(e) === 404 || codigo(e) === 410) {
          await db.ocorrencia.update({ where: { id: o.id }, data: { googleEventIdPessoal: null, pessoaAgendaId: null } });
          return;
        }
        throw e;
      }
      return;
    }
    if (o.status === 'FINALIZADA') return; // não cria cópia de algo que já terminou
    const id = await agendaPessoal(dono).criar(dados);
    await db.ocorrencia.update({ where: { id: o.id }, data: { googleEventIdPessoal: id, pessoaAgendaId: dono.id } });
  } catch (e) {
    if (!(await desconectarPorErro(dono, e))) throw e;
  }
}

/**
 * Mantém a cópia de cada ocorrência na agenda Google pessoal do responsável (cria, atualiza
 * ou remove conforme o estado atual). Idempotente; falhas são registradas e não desfazem nada
 * no sistema, pois a agenda única do sistema continua sendo a fonte da verdade.
 */
export async function atualizarCopiasPessoais(ocorrenciaIds: string[]) {
  const ids = [...new Set(ocorrenciaIds)];
  if (!ids.length) return;
  const ocorrencias = await db.ocorrencia.findMany({
    where: { id: { in: ids } },
    include: { sala: true, reserva: { include: { pessoa: true } } },
  });
  await emParalelo(ocorrencias, LIMITE, async (o) => {
    try {
      await sincronizarCopia(o);
    } catch (e) {
      console.error('[agenda pessoal] falha ao atualizar cópia', o.id, e);
    }
  });
}

/** Ao conectar a agenda: copia as reservas futuras que já existiam (ex.: feitas por um admin). */
export async function copiarReservasFuturas(pessoaId: string, agora = new Date()) {
  const futuras = await db.ocorrencia.findMany({
    where: { reserva: { pessoaId }, status: { in: STATUS_ATIVOS }, fimUtc: { gt: agora } },
    select: { id: true },
  });
  await atualizarCopiasPessoais(futuras.map((o) => o.id));
}

import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { comTrava } from '@/lib/trava';
import { agenda } from '@/integrations/google';
import { codigoSala } from '@/domain/sala';
import { corDoAndar } from './configuracao';
import { eventoDoBloqueio } from './eventos-google';
import { espelhar, marcarEspelhoCancelado } from './espelho';
import { ErroNegocio } from './erros';
import { ocorrenciasFuturasDaSala } from './reservas';
import { resolverOcorrencias, type Resolucao } from './resolucao';

/** Reservas da sala que caem dentro do período a ser bloqueado. */
export async function impactoBloqueio(salaId: string, inicio: Date, fim: Date, agora = new Date()) {
  return ocorrenciasFuturasDaSala(salaId, agora, { inicio, fim });
}

/** Bloqueia a sala por período, aplicando antes a resolução (transferir/cancelar) às reservas afetadas. */
export async function bloquearSala(
  salaId: string,
  dados: { inicio: Date; fim: Date; motivo: string },
  resolucao: Resolucao | undefined,
  quem: string,
  agora = new Date(),
) {
  const motivo = dados.motivo.trim();
  if (!motivo) throw new ErroNegocio('Informe o motivo do bloqueio.');
  if (dados.fim <= dados.inicio) throw new ErroNegocio('O fim do bloqueio deve ser depois do início.');
  if (dados.fim <= agora) throw new ErroNegocio('O período informado já terminou.');

  return comTrava(`sala:${salaId}`, async () => {
    const sala = await db.sala.findUnique({ where: { id: salaId } });
    if (!sala?.ativa) throw new ErroNegocio('Sala não encontrada ou desativada.');

    const afetadas = await impactoBloqueio(salaId, dados.inicio, dados.fim, agora);
    const resultado = await resolverOcorrencias(afetadas, resolucao, quem, `bloqueio da ${codigoSala(sala.numero)}: ${motivo}`);

    let bloqueio = await db.bloqueio.create({
      data: { salaId, inicioUtc: dados.inicio, fimUtc: dados.fim, motivo, criadoPor: quem },
    });
    const ev = eventoDoBloqueio(sala, bloqueio, await corDoAndar(sala.andar));
    try {
      const gid = await agenda().criar(ev);
      bloqueio = await db.bloqueio.update({ where: { id: bloqueio.id }, data: { googleEventId: gid } });
      await espelhar(gid, {
        titulo: ev.titulo,
        inicioUtc: dados.inicio,
        fimUtc: dados.fim,
        salaNumero: sala.numero,
        tipo: 'bloqueio',
        bloqueioId: bloqueio.id,
        estado: 'VINCULADO',
      });
    } catch (e) {
      await db.bloqueio.delete({ where: { id: bloqueio.id } });
      throw new ErroNegocio('Falha ao gravar o bloqueio no Google Agenda.', String(e));
    }
    await auditar(quem, 'bloquear', 'sala', salaId, {
      bloqueioId: bloqueio.id,
      inicio: dados.inicio,
      fim: dados.fim,
      motivo,
      ...resultado,
    });
    publicar('bloqueios', { salaId });
    return { bloqueio, ...resultado };
  });
}

export async function removerBloqueio(id: string, quem: string) {
  const b = await db.bloqueio.findUnique({ where: { id } });
  if (!b || !b.ativo) throw new ErroNegocio('Bloqueio não encontrado.');
  await db.bloqueio.update({ where: { id }, data: { ativo: false } });
  if (b.googleEventId) {
    await agenda().remover(b.googleEventId);
    await marcarEspelhoCancelado(b.googleEventId);
  }
  await auditar(quem, 'remover_bloqueio', 'bloqueio', id, { salaId: b.salaId });
  publicar('bloqueios', { salaId: b.salaId });
}

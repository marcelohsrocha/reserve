import { db } from '@/lib/db';
import { usuarioOpcional } from '@/lib/usuario';
import { STATUS_ATIVOS, type StatusOcorrencia } from '@/domain/status';
import { gerarIcs } from '@/domain/link-agenda';
import { eventoParaAgendaPessoal } from '@/services/eventos-google';

export const dynamic = 'force-dynamic';

/** Arquivo .ics com as ocorrências futuras da reserva (dono da reserva ou admin). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await usuarioOpcional();
  if (!u) return new Response('Não autenticado', { status: 401 });
  const reserva = await db.reserva.findUnique({
    where: { id },
    include: { ocorrencias: { include: { sala: true }, orderBy: { inicioUtc: 'asc' } } },
  });
  if (!reserva || (!u.admin && reserva.pessoaId !== u.id)) return new Response('Não encontrada', { status: 404 });
  const agora = new Date();
  const futuras = reserva.ocorrencias.filter((o) => STATUS_ATIVOS.includes(o.status as StatusOcorrencia) && o.fimUtc > agora);
  const ics = gerarIcs(futuras.map((o) => eventoParaAgendaPessoal(o.sala, reserva, o)), agora);
  const nome = reserva.titulo.normalize('NFD').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'reserva';
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nome}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}

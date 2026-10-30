'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/usuario';
import { localParaUtc } from '@/lib/tempo';
import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { publicar } from '@/lib/barramento';
import { ErroConflito, ErroNegocio, descreverConflito } from '@/services/erros';
import { RecorrenciaInvalida, parseDiasSemana } from '@/domain/ocorrencias';
import * as salas from '@/services/salas';
import * as pessoas from '@/services/pessoas';
import * as reservas from '@/services/reservas';
import * as bloqueios from '@/services/bloqueios';
import * as sync from '@/services/sincronizacao';
import type { Resolucao } from '@/services/resolucao';
import { dataBR, horaLocal, DIAS_SEMANA, diaSemanaLocal } from '@/lib/tempo';

export interface Estado {
  ok: boolean;
  mensagem?: string;
  detalhes?: string[];
}

const txt = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/** Executa a ação convertendo erros de negócio em mensagem para o formulário. */
async function executar(fn: (quem: string) => Promise<string | void>): Promise<Estado> {
  try {
    const msg = await fn(await usuarioAtual());
    revalidatePath('/', 'layout');
    return { ok: true, mensagem: msg || 'Salvo.' };
  } catch (e) {
    if (e instanceof ErroNegocio) {
      const detalhes = Array.isArray(e.detalhes) ? (e.detalhes as string[]) : undefined;
      return { ok: false, mensagem: e.message, detalhes };
    }
    if (e instanceof RecorrenciaInvalida) return { ok: false, mensagem: e.message };
    // redirect() do Next lança um erro especial que precisa seguir adiante.
    if (e && typeof e === 'object' && 'digest' in e && String((e as { digest: unknown }).digest).startsWith('NEXT_REDIRECT')) throw e;
    console.error(e);
    return { ok: false, mensagem: 'Erro inesperado. Tente novamente.' };
  }
}

function resolucaoDoForm(fd: FormData): Resolucao | undefined {
  const acao = txt(fd, 'resolucao');
  if (acao === 'cancelar') return { acao: 'cancelar' };
  if (acao === 'transferir') {
    const destinoId = txt(fd, 'destinoId');
    if (!destinoId) throw new ErroNegocio('Escolha a sala de destino.');
    return { acao: 'transferir', destinoId, cancelarRestantes: fd.get('cancelarRestantes') === 'on' };
  }
  return undefined;
}

// ---------- Salas ----------

export async function acaoCriarSala(_: Estado | null, fd: FormData): Promise<Estado> {
  let id = '';
  const r = await executar(async (quem) => {
    const numero = txt(fd, 'numero') ? Number(txt(fd, 'numero')) : null;
    id = (await salas.criarSala({ numero, nome: txt(fd, 'nome'), andar: txt(fd, 'andar') }, quem)).id;
  });
  if (r.ok) redirect(`/admin/salas/${id}?criada=1`);
  return r;
}

export async function acaoEditarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.editarSala(txt(fd, 'id'), { numero: Number(txt(fd, 'numero')), nome: txt(fd, 'nome'), andar: txt(fd, 'andar') }, quem);
    return 'Sala atualizada.';
  });
}

export async function acaoDesativarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const r = await salas.desativarSala(txt(fd, 'id'), resolucaoDoForm(fd), quem);
    return `Sala desativada. ${r.transferidas} transferida(s), ${r.canceladas} cancelada(s).`;
  });
}

export async function acaoReativarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.reativarSala(txt(fd, 'id'), quem);
    return 'Sala reativada com um NOVO QR Code. Imprima e substitua o QR da porta.';
  });
}

export async function acaoExcluirSala(_: Estado | null, fd: FormData): Promise<Estado> {
  const r = await executar(async (quem) => salas.excluirSala(txt(fd, 'id'), quem));
  if (r.ok) redirect('/admin/salas');
  return r;
}

export async function acaoRegenerarQr(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.regenerarQr(txt(fd, 'id'), quem);
    return 'Novo QR gerado. O QR antigo deixou de funcionar.';
  });
}

export async function acaoBloquear(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const [di, hi] = txt(fd, 'inicio').split('T');
    const [df, hf] = txt(fd, 'fim').split('T');
    if (!di || !hi || !df || !hf) throw new ErroNegocio('Informe data e hora de início e fim.');
    const r = await bloqueios.bloquearSala(
      txt(fd, 'id'),
      { inicio: localParaUtc(di, hi), fim: localParaUtc(df, hf), motivo: txt(fd, 'motivo') },
      resolucaoDoForm(fd),
      quem,
    );
    return `Sala bloqueada. ${r.transferidas} transferida(s), ${r.canceladas} cancelada(s).`;
  });
}

export async function acaoRemoverBloqueio(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await bloqueios.removerBloqueio(txt(fd, 'id'), quem);
    return 'Bloqueio removido.';
  });
}

// ---------- Pessoas ----------

export async function acaoCriarPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const p = await pessoas.criarPessoa({ nome: txt(fd, 'nome'), telefone: txt(fd, 'telefone') }, quem);
    return `${p.nome} cadastrado(a).`;
  });
}

export async function acaoEditarPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await pessoas.editarPessoa(txt(fd, 'id'), { nome: txt(fd, 'nome'), telefone: txt(fd, 'telefone') }, quem);
  });
}

export async function acaoExcluirPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await pessoas.excluirPessoa(txt(fd, 'id'), quem);
    return 'Pessoa excluída.';
  });
}

// ---------- Reservas ----------

function dadosReserva(fd: FormData): reservas.NovaReserva {
  return {
    salaId: txt(fd, 'salaId'),
    pessoaId: txt(fd, 'pessoaId'),
    titulo: txt(fd, 'titulo'),
    dataInicio: txt(fd, 'dataInicio'),
    dataFim: txt(fd, 'dataFim') || txt(fd, 'dataInicio'),
    horaInicio: txt(fd, 'horaInicio'),
    horaFim: txt(fd, 'horaFim'),
    diasSemana: parseDiasSemana(fd.getAll('diasSemana').join(',')),
  };
}

export async function acaoVerificarReserva(_: Estado | null, fd: FormData): Promise<Estado> {
  try {
    const { ocorrencias, conflitos } = await reservas.previaReserva(dadosReserva(fd));
    if (conflitos.length) return { ok: false, mensagem: `Conflito em ${conflitos.length} horário(s):`, detalhes: conflitos.map(descreverConflito) };
    const lista = ocorrencias.slice(0, 10).map((o) => `${DIAS_SEMANA[diaSemanaLocal(o.inicio)]} ${dataBR(o.inicio)} ${horaLocal(o.inicio)}–${horaLocal(o.fim)}`);
    if (ocorrencias.length > 10) lista.push(`… e mais ${ocorrencias.length - 10}`);
    return { ok: true, mensagem: `Sala livre. Serão criadas ${ocorrencias.length} ocorrência(s):`, detalhes: lista };
  } catch (e) {
    if (e instanceof ErroNegocio || e instanceof RecorrenciaInvalida) return { ok: false, mensagem: e.message };
    console.error(e);
    return { ok: false, mensagem: 'Não foi possível verificar agora (Google Agenda indisponível?).' };
  }
}

export async function acaoCriarReserva(_: Estado | null, fd: FormData): Promise<Estado> {
  let id = '';
  const r = await executar(async (quem) => {
    id = (await reservas.criarReserva(dadosReserva(fd), quem)).id;
  });
  if (r.ok) redirect(`/admin/reservas/${id}?criada=1`);
  return r;
}

export async function acaoEditarReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await reservas.editarReserva(txt(fd, 'id'), { titulo: txt(fd, 'titulo'), pessoaId: txt(fd, 'pessoaId') }, quem);
    return 'Reserva atualizada (eventos futuros do Google também).';
  });
}

export async function acaoCancelarOcorrencia(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await reservas.cancelarOcorrencias([txt(fd, 'id')], quem);
    return 'Ocorrência cancelada.';
  });
}

export async function acaoLiberarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await reservas.liberarOcorrencia(txt(fd, 'id'), quem);
    return 'Sala liberada. Ela já aparece como livre nos painéis.';
  });
}

export async function acaoCancelarReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const n = await reservas.cancelarReserva(txt(fd, 'id'), quem);
    return `${n} ocorrência(s) futura(s) cancelada(s).`;
  });
}

export async function acaoTransferirReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const futuras = await db.ocorrencia.findMany({
      where: { reservaId: txt(fd, 'id'), status: { in: ['AGENDADA', 'EM_ANDAMENTO', 'CONFIRMADA'] }, fimUtc: { gt: new Date() } },
      select: { id: true },
    });
    const r = await reservas.transferirOcorrencias(futuras.map((o) => o.id), txt(fd, 'destinoId'), quem);
    if (r.naoCouberam.length) {
      throw new ErroNegocio(
        `${r.transferidas.length} transferida(s); ${r.naoCouberam.length} não couberam e continuam na sala original:`,
        r.naoCouberam.map((n) => (n.conflitos[0] ? descreverConflito(n.conflitos[0]) : dataBR(n.ocorrencia.inicioUtc))),
      );
    }
    return `${r.transferidas.length} ocorrência(s) transferida(s).`;
  });
}

export async function acaoRemarcarOcorrencia(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await reservas.remarcarOcorrencia(
      txt(fd, 'id'),
      { data: txt(fd, 'data'), horaInicio: txt(fd, 'horaInicio'), horaFim: txt(fd, 'horaFim'), salaId: txt(fd, 'salaId') || undefined },
      quem,
    );
    return 'Ocorrência remarcada.';
  });
}

// ---------- Google ----------

export async function acaoVincularEvento(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await sync.vincularEvento(txt(fd, 'id'), txt(fd, 'salaId'), quem);
    return 'Evento vinculado à sala.';
  });
}

export async function acaoIgnorarEvento(_: Estado | null, fd: FormData) {
  return executar(async (quem) => sync.ignorarEvento(txt(fd, 'id'), quem));
}

export async function acaoSincronizarAgora(_: Estado | null, _fd: FormData) {
  return executar(async () => {
    const n = await sync.sincronizar();
    return `Sincronizado. ${n} alteração(ões) recebida(s) do Google.`;
  });
}

// ---------- Configurações ----------

export async function acaoSalvarConfiguracao(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const tolerancia = Number(txt(fd, 'toleranciaCheckinMin'));
    if (!Number.isInteger(tolerancia) || tolerancia < 1 || tolerancia > 240) throw new ErroNegocio('Tolerância deve ser entre 1 e 240 minutos.');
    const dados = {
      toleranciaCheckinMin: tolerancia,
      liberacaoAutomatica: fd.get('liberacaoAutomatica') === 'on',
      corPadrao: txt(fd, 'corPadrao') || '8',
    };
    await db.configuracao.upsert({ where: { id: 1 }, update: dados, create: { id: 1, ...dados } });
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith('cor:')) continue;
      const andar = k.slice(4);
      if (v) await db.corAndar.upsert({ where: { andar }, update: { colorId: String(v) }, create: { andar, colorId: String(v) } });
      else await db.corAndar.deleteMany({ where: { andar } });
    }
    await auditar(quem, 'editar', 'configuracao', '1', dados);
    publicar('salas');
    return 'Configurações salvas. As novas cores valem para eventos criados ou alterados daqui em diante.';
  });
}

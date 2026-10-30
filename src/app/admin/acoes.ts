'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { usuarioDaAcao, usuarioOpcional, type Usuario } from '@/lib/usuario';
import { env } from '@/lib/env';
import { decifrar } from '@/lib/cripto';
import { revogar } from '@/integrations/google/oauth';
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

/**
 * Executa a ação convertendo erros de negócio em mensagem para o formulário.
 * `admin: true` restringe a ação à administração; `quem` (auditoria) é o e-mail do usuário.
 */
async function executar(fn: (quem: string, u: Usuario) => Promise<string | void>, opcoes: { admin?: boolean } = {}): Promise<Estado> {
  try {
    const u = await usuarioDaAcao();
    if (opcoes.admin && !u.admin) throw new ErroNegocio('Somente administradores podem fazer isso.');
    const msg = await fn(u.email!, u);
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
  }, { admin: true });
  if (r.ok) redirect(`/admin/salas/${id}?criada=1`);
  return r;
}

export async function acaoEditarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.editarSala(txt(fd, 'id'), { numero: Number(txt(fd, 'numero')), nome: txt(fd, 'nome'), andar: txt(fd, 'andar') }, quem);
    return 'Sala atualizada.';
  }, { admin: true });
}

export async function acaoDesativarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const r = await salas.desativarSala(txt(fd, 'id'), resolucaoDoForm(fd), quem);
    return `Sala desativada. ${r.transferidas} transferida(s), ${r.canceladas} cancelada(s).`;
  }, { admin: true });
}

export async function acaoReativarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.reativarSala(txt(fd, 'id'), quem);
    return 'Sala reativada com um NOVO QR Code. Imprima e substitua o QR da porta.';
  }, { admin: true });
}

export async function acaoExcluirSala(_: Estado | null, fd: FormData): Promise<Estado> {
  const r = await executar(async (quem) => salas.excluirSala(txt(fd, 'id'), quem), { admin: true });
  if (r.ok) redirect('/admin/salas');
  return r;
}

export async function acaoRegenerarQr(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await salas.regenerarQr(txt(fd, 'id'), quem);
    return 'Novo QR gerado. O QR antigo deixou de funcionar.';
  }, { admin: true });
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
  }, { admin: true });
}

export async function acaoRemoverBloqueio(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await bloqueios.removerBloqueio(txt(fd, 'id'), quem);
    return 'Bloqueio removido.';
  }, { admin: true });
}

// ---------- Pessoas ----------

const dadosPessoa = (fd: FormData) => ({ nome: txt(fd, 'nome'), email: txt(fd, 'email'), telefone: txt(fd, 'telefone'), papel: txt(fd, 'papel') });

export async function acaoCriarPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    const p = await pessoas.criarPessoa(dadosPessoa(fd), quem);
    return `${p.nome} cadastrado(a).`;
  }, { admin: true });
}

export async function acaoEditarPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await pessoas.editarPessoa(txt(fd, 'id'), { ...dadosPessoa(fd), ativo: fd.get('ativo') === 'on' }, quem);
  }, { admin: true });
}

export async function acaoExcluirPessoa(_: Estado | null, fd: FormData) {
  return executar(async (quem) => {
    await pessoas.excluirPessoa(txt(fd, 'id'), quem);
    return 'Pessoa excluída.';
  }, { admin: true });
}

// ---------- Reservas ----------

/** Membros só mexem nas próprias reservas; admins, em todas. */
async function donoDaReserva(id: string, u: Usuario) {
  if (u.admin) return;
  const r = await db.reserva.findUnique({ where: { id }, select: { pessoaId: true } });
  if (r?.pessoaId !== u.id) throw new ErroNegocio('Você só pode alterar as suas próprias reservas.');
}

async function donoDaOcorrencia(id: string, u: Usuario) {
  if (u.admin) return;
  const o = await db.ocorrencia.findUnique({ where: { id }, select: { reserva: { select: { pessoaId: true } } } });
  if (o?.reserva.pessoaId !== u.id) throw new ErroNegocio('Você só pode alterar as suas próprias reservas.');
}

/** O responsável é quem está logado; só um admin pode reservar em nome de outra pessoa. */
function dadosReserva(fd: FormData, u: Usuario): reservas.NovaReserva {
  return {
    salaId: txt(fd, 'salaId'),
    pessoaId: u.admin ? txt(fd, 'pessoaId') || u.id : u.id,
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
    const { ocorrencias, conflitos } = await reservas.previaReserva(dadosReserva(fd, await usuarioDaAcao()));
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
  const r = await executar(async (quem, u) => {
    id = (await reservas.criarReserva(dadosReserva(fd, u), quem)).id;
  });
  if (r.ok) redirect(`/admin/reservas/${id}?criada=1`);
  return r;
}

export async function acaoEditarReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem, u) => {
    await donoDaReserva(txt(fd, 'id'), u);
    await reservas.editarReserva(txt(fd, 'id'), { titulo: txt(fd, 'titulo'), pessoaId: u.admin ? txt(fd, 'pessoaId') || undefined : undefined }, quem);
    return 'Reserva atualizada (eventos futuros do Google também).';
  });
}

export async function acaoCancelarOcorrencia(_: Estado | null, fd: FormData) {
  return executar(async (quem, u) => {
    await donoDaOcorrencia(txt(fd, 'id'), u);
    await reservas.cancelarOcorrencias([txt(fd, 'id')], quem);
    return 'Ocorrência cancelada.';
  });
}

export async function acaoLiberarSala(_: Estado | null, fd: FormData) {
  return executar(async (quem, u) => {
    await donoDaOcorrencia(txt(fd, 'id'), u);
    await reservas.liberarOcorrencia(txt(fd, 'id'), quem);
    return 'Sala liberada. Ela já aparece como livre nos painéis.';
  });
}

export async function acaoCancelarReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem, u) => {
    await donoDaReserva(txt(fd, 'id'), u);
    const n = await reservas.cancelarReserva(txt(fd, 'id'), quem);
    return `${n} ocorrência(s) futura(s) cancelada(s).`;
  });
}

export async function acaoTransferirReserva(_: Estado | null, fd: FormData) {
  return executar(async (quem, u) => {
    await donoDaReserva(txt(fd, 'id'), u);
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
  return executar(async (quem, u) => {
    await donoDaOcorrencia(txt(fd, 'id'), u);
    await reservas.remarcarOcorrencia(
      txt(fd, 'id'),
      { data: txt(fd, 'data'), horaInicio: txt(fd, 'horaInicio'), horaFim: txt(fd, 'horaFim'), salaId: txt(fd, 'salaId') || undefined },
      quem,
    );
    return 'Ocorrência remarcada.';
  });
}

// ---------- Google ----------

export async function acaoSincronizarAgora(_: Estado | null, _fd: FormData) {
  return executar(async () => {
    const n = await sync.sincronizar();
    return `Sincronizado. ${n} alteração(ões) recebida(s) do Google.`;
  }, { admin: true });
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
  }, { admin: true });
}

// ---------- Conta ----------

export async function acaoDefinirTelefone(_: Estado | null, fd: FormData): Promise<Estado> {
  try {
    const u = await usuarioOpcional();
    if (!u) return { ok: false, mensagem: 'Sua sessão expirou. Entre novamente.' };
    await pessoas.definirTelefone(u.id, txt(fd, 'telefone'), u.email!);
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, mensagem: e.message };
    console.error(e);
    return { ok: false, mensagem: 'Erro inesperado. Tente novamente.' };
  }
  redirect(txt(fd, 'volta').startsWith('/') && !txt(fd, 'volta').startsWith('//') ? txt(fd, 'volta') : '/admin');
}

export async function acaoDesconectarAgenda(_: Estado | null, _fd: FormData) {
  return executar(async (quem, u) => {
    if (u.googleRefreshToken && !env.loginDev) await revogar(decifrar(u.googleRefreshToken)).catch(() => {});
    await pessoas.desconectarAgenda(u.id, quem);
    return 'Agenda pessoal desconectada. Novas reservas não serão mais copiadas para ela.';
  });
}

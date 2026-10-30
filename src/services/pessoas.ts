import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { cifrar } from '@/lib/cripto';
import { env } from '@/lib/env';
import { normalizarTelefone, formatarTelefone } from '@/lib/telefone';
import { ErroNegocio } from './erros';

/** Pessoa = usuário do sistema, identificado pela conta Google (e-mail). */
export type Papel = 'MEMBRO' | 'ADMIN';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(email: string) {
  const e = email.trim().toLowerCase();
  if (!EMAIL.test(e)) throw new ErroNegocio('Informe o e-mail da conta Google (ex.: nome@gmail.com).');
  return e;
}

function validarTelefone(telefone: string) {
  const tel = normalizarTelefone(telefone);
  if (!tel) throw new ErroNegocio('Telefone inválido. Use o formato (99) 99999-9999.');
  return tel;
}

function validar(dados: { nome: string; email: string; telefone?: string; papel?: string }) {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  if (!nome) throw new ErroNegocio('Informe o nome.');
  return {
    nome,
    email: validarEmail(dados.email),
    telefoneE164: dados.telefone?.trim() ? validarTelefone(dados.telefone) : null,
    papel: (dados.papel === 'ADMIN' ? 'ADMIN' : 'MEMBRO') as Papel,
  };
}

async function garantirUnicos(v: { email: string; telefoneE164: string | null }, ignorarId?: string) {
  const porEmail = await db.pessoa.findUnique({ where: { email: v.email } });
  if (porEmail && porEmail.id !== ignorarId) throw new ErroNegocio(`O e-mail ${v.email} já está cadastrado para ${porEmail.nome}.`);
  if (v.telefoneE164) {
    const porTel = await db.pessoa.findUnique({ where: { telefoneE164: v.telefoneE164 } });
    if (porTel && porTel.id !== ignorarId) throw new ErroNegocio(`O telefone ${formatarTelefone(v.telefoneE164)} já está cadastrado para ${porTel.nome}.`);
  }
}

/** Admins definidos em ADMIN_EMAILS não podem ser rebaixados pela tela. */
const papelEfetivo = (email: string, papel: Papel): Papel => (env.adminEmails.includes(email) ? 'ADMIN' : papel);

export async function criarPessoa(dados: { nome: string; email: string; telefone?: string; papel?: string }, quem: string) {
  const v = validar(dados);
  await garantirUnicos(v);
  const p = await db.pessoa.create({ data: { ...v, papel: papelEfetivo(v.email, v.papel) } });
  await auditar(quem, 'criar', 'pessoa', p.id, { nome: p.nome, email: p.email, papel: p.papel });
  return p;
}

export async function editarPessoa(
  id: string,
  dados: { nome: string; email: string; telefone?: string; papel?: string; ativo?: boolean },
  quem: string,
) {
  const antes = await db.pessoa.findUnique({ where: { id } });
  if (!antes) throw new ErroNegocio('Pessoa não encontrada.');
  const v = validar(dados);
  await garantirUnicos(v, id);
  const p = await db.pessoa.update({
    where: { id },
    data: {
      ...v,
      papel: papelEfetivo(v.email, v.papel),
      ativo: dados.ativo ?? antes.ativo,
      // Trocar o e-mail desvincula a conta Google anterior.
      ...(antes.email !== v.email && { googleRefreshToken: null, agendaConectadaEm: null }),
    },
  });
  await auditar(quem, 'editar', 'pessoa', id, {
    antes: { nome: antes.nome, email: antes.email, papel: antes.papel, ativo: antes.ativo },
    depois: { nome: p.nome, email: p.email, papel: p.papel, ativo: p.ativo },
    telefoneAlterado: antes.telefoneE164 !== p.telefoneE164,
  });
  return p;
}

export async function excluirPessoa(id: string, quem: string) {
  const n = await db.reserva.count({ where: { pessoaId: id } });
  if (n > 0) throw new ErroNegocio('Esta pessoa tem reservas no histórico e não pode ser excluída. Desative o acesso dela.');
  const p = await db.pessoa.delete({ where: { id } });
  await auditar(quem, 'excluir', 'pessoa', id, { nome: p.nome, email: p.email });
}

export class AcessoNegado extends Error {}

/**
 * Login com Google: só entra quem foi cadastrado por um admin (pelo e-mail) ou está em
 * ADMIN_EMAILS. Guarda o refresh token cifrado quando o usuário autorizou a agenda.
 */
export async function entrarComGoogle(conta: { email: string; nome: string; refreshToken: string | null; agendaAutorizada: boolean }) {
  const email = conta.email.toLowerCase();
  let pessoa = await db.pessoa.findUnique({ where: { email } });
  const adminFixo = env.adminEmails.includes(email);
  if (!pessoa) {
    if (!adminFixo) throw new AcessoNegado();
    pessoa = await db.pessoa.create({ data: { nome: conta.nome, email, papel: 'ADMIN' } });
    await auditar(email, 'criar', 'pessoa', pessoa.id, { nome: pessoa.nome, email, papel: 'ADMIN', origem: 'ADMIN_EMAILS' });
  }
  if (!pessoa.ativo) throw new AcessoNegado();

  const conectouAgora = Boolean(conta.refreshToken && conta.agendaAutorizada);
  const atualizada = await db.pessoa.update({
    where: { id: pessoa.id },
    data: {
      ultimoAcessoEm: new Date(),
      ...(adminFixo && { papel: 'ADMIN' }),
      ...(conectouAgora && { googleRefreshToken: cifrar(conta.refreshToken!), agendaConectadaEm: new Date() }),
      // O usuário desmarcou a permissão da agenda na tela do Google.
      ...(!conta.agendaAutorizada && { googleRefreshToken: null, agendaConectadaEm: null }),
    },
  });
  await auditar(email, 'entrar', 'pessoa', pessoa.id, { agenda: Boolean(atualizada.googleRefreshToken) });
  return { pessoa: atualizada, conectouAgora };
}

/** Primeiro acesso (ou troca pelo próprio usuário): telefone usado no check-in. */
export async function definirTelefone(id: string, telefone: string, quem: string) {
  const tel = validarTelefone(telefone);
  const outra = await db.pessoa.findUnique({ where: { telefoneE164: tel } });
  if (outra && outra.id !== id) throw new ErroNegocio('Este telefone já está cadastrado para outra pessoa. Fale com a secretaria.');
  await db.pessoa.update({ where: { id }, data: { telefoneE164: tel } });
  await auditar(quem, 'definir_telefone', 'pessoa', id);
}

export async function desconectarAgenda(id: string, quem: string) {
  await db.pessoa.update({ where: { id }, data: { googleRefreshToken: null, agendaConectadaEm: null } });
  await auditar(quem, 'desconectar_agenda', 'pessoa', id);
}

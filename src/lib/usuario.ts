import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Pessoa } from '@prisma/client';
import { db } from './db';
import { ErroNegocio } from '@/services/erros';

/** Cabeçalho preenchido pelo middleware depois de validar o cookie de sessão. */
export const CABECALHO_USUARIO = 'x-usuario-id';

export type Usuario = Pessoa & { admin: boolean };

/** Usuário logado (ou null). Papel e status são sempre lidos do banco. */
export async function usuarioOpcional(): Promise<Usuario | null> {
  const id = (await headers()).get(CABECALHO_USUARIO);
  if (!id) return null;
  const p = await db.pessoa.findUnique({ where: { id } });
  if (!p || !p.ativo || !p.email) return null;
  return { ...p, admin: p.papel === 'ADMIN' };
}

/** Para páginas: exige login e telefone cadastrado (primeiro acesso). */
export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioOpcional();
  if (!u) redirect('/entrar');
  if (!u.telefoneE164) redirect('/primeiro-acesso');
  return u;
}

/** Para páginas exclusivas da administração. */
export async function exigirAdmin(): Promise<Usuario> {
  const u = await exigirUsuario();
  if (!u.admin) redirect('/admin?semPermissao=1');
  return u;
}

/** Para ações: lança erro de negócio em vez de redirecionar. */
export async function usuarioDaAcao(): Promise<Usuario> {
  const u = await usuarioOpcional();
  if (!u) throw new ErroNegocio('Sua sessão expirou. Entre novamente com sua conta Google.');
  if (!u.telefoneE164) throw new ErroNegocio('Cadastre seu telefone antes de continuar.');
  return u;
}

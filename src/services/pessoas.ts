import { db } from '@/lib/db';
import { auditar } from '@/lib/auditoria';
import { normalizarTelefone, formatarTelefone } from '@/lib/telefone';
import { ErroNegocio } from './erros';

function validar(dados: { nome: string; telefone: string }) {
  const nome = dados.nome.trim().replace(/\s+/g, ' ');
  if (!nome) throw new ErroNegocio('Informe o nome.');
  const tel = normalizarTelefone(dados.telefone);
  if (!tel) throw new ErroNegocio('Telefone inválido. Use o formato (99) 99999-9999.');
  return { nome, telefoneE164: tel };
}

async function garantirTelefoneUnico(tel: string, ignorarId?: string) {
  const outra = await db.pessoa.findUnique({ where: { telefoneE164: tel } });
  if (outra && outra.id !== ignorarId) throw new ErroNegocio(`O telefone ${formatarTelefone(tel)} já está cadastrado para ${outra.nome}.`);
}

export async function criarPessoa(dados: { nome: string; telefone: string }, quem: string) {
  const v = validar(dados);
  await garantirTelefoneUnico(v.telefoneE164);
  const p = await db.pessoa.create({ data: v });
  await auditar(quem, 'criar', 'pessoa', p.id, { nome: p.nome });
  return p;
}

export async function editarPessoa(id: string, dados: { nome: string; telefone: string }, quem: string) {
  const v = validar(dados);
  await garantirTelefoneUnico(v.telefoneE164, id);
  const antes = await db.pessoa.findUnique({ where: { id } });
  if (!antes) throw new ErroNegocio('Pessoa não encontrada.');
  const p = await db.pessoa.update({ where: { id }, data: v });
  await auditar(quem, 'editar', 'pessoa', id, { antes: { nome: antes.nome }, depois: { nome: p.nome }, telefoneAlterado: antes.telefoneE164 !== p.telefoneE164 });
  return p;
}

export async function excluirPessoa(id: string, quem: string) {
  const n = await db.reserva.count({ where: { pessoaId: id } });
  if (n > 0) throw new ErroNegocio('Esta pessoa tem reservas no histórico e não pode ser excluída.');
  const p = await db.pessoa.delete({ where: { id } });
  await auditar(quem, 'excluir', 'pessoa', id, { nome: p.nome });
}

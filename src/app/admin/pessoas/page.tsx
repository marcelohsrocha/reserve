import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { formatarTelefone } from '@/lib/telefone';
import { dataHoraBR } from '@/lib/tempo';
import { FormAcao } from '@/components/FormAcao';
import { TelefoneInput } from '@/components/TelefoneInput';
import { acaoCriarPessoa, acaoEditarPessoa, acaoExcluirPessoa } from '../acoes';
import { exigirAdmin } from '@/lib/usuario';

function CamposPessoa({ p }: { p?: { nome: string; email: string | null; telefoneE164: string | null; papel: string } }) {
  const fixo = Boolean(p?.email && env.adminEmails.includes(p.email));
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="rotulo">Nome</label>
        <input name="nome" defaultValue={p?.nome} required maxLength={100} className="campo" />
      </div>
      <div>
        <label className="rotulo">E-mail da conta Google</label>
        <input name="email" type="email" defaultValue={p?.email ?? ''} required className="campo" placeholder="nome@gmail.com" />
      </div>
      <div>
        <label className="rotulo">Telefone <span className="font-normal text-slate-400">(opcional — a pessoa informa no 1º acesso)</span></label>
        <TelefoneInput obrigatorio={false} defaultValue={p?.telefoneE164?.replace(/^\+55/, '') ?? ''} />
      </div>
      <div>
        <label className="rotulo">Papel</label>
        <select name="papel" defaultValue={p?.papel ?? 'MEMBRO'} className="campo" disabled={fixo}>
          <option value="MEMBRO">Membro – reserva para si</option>
          <option value="ADMIN">Administrador – gerencia tudo</option>
        </select>
        {fixo && (
          <>
            <input type="hidden" name="papel" value="ADMIN" />
            <p className="mt-1 text-xs text-slate-500">Definido em ADMIN_EMAILS.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default async function Pessoas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await exigirAdmin();
  const { q = '' } = await searchParams;
  const digitos = q.replace(/\D/g, '');
  const pessoas = await db.pessoa.findMany({
    where: q
      ? { OR: [{ nome: { contains: q } }, { email: { contains: q.toLowerCase() } }, ...(digitos ? [{ telefoneE164: { contains: digitos } }] : [])] }
      : {},
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }],
    include: { _count: { select: { reservas: true } } },
  });
  return (
    <div className="space-y-6">
      <div>
        <h1 className="titulo-pagina">Pessoas</h1>
        <p className="-mt-2 text-sm text-slate-600">
          Só entra no sistema quem estiver cadastrado aqui, pelo e-mail da conta Google. Membros reservam para si; administradores
          gerenciam salas, reservas e configurações.
        </p>
      </div>
      <section className="cartao">
        <h2 className="mb-3 font-semibold">Nova pessoa</h2>
        <FormAcao acao={acaoCriarPessoa} botao="Cadastrar">
          <CamposPessoa />
        </FormAcao>
      </section>

      <section className="cartao space-y-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nome, e-mail ou telefone" className="campo" />
          <button className="btn-secundario">Buscar</button>
        </form>
        {pessoas.length === 0 ? (
          <p className="text-slate-600">Nenhuma pessoa encontrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pessoas.map((p) => (
              <li key={p.id} className={`py-2 ${p.ativo ? '' : 'opacity-60'}`}>
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <strong>{p.nome}</strong>{' '}
                      {p.papel === 'ADMIN' && <span className="etiqueta bg-slate-900 text-white">Admin</span>}{' '}
                      {!p.ativo && <span className="etiqueta bg-slate-100 text-slate-500">Sem acesso</span>}
                      <span className="block truncate text-sm text-slate-500">
                        {p.email ?? 'sem e-mail'} · {formatarTelefone(p.telefoneE164)}
                        {p.googleRefreshToken && ' · 📅 agenda conectada'}
                      </span>
                    </span>
                    <span className="text-xs text-slate-500">
                      {p._count.reservas} reserva(s){p.ultimoAcessoEm && ` · último acesso ${dataHoraBR(p.ultimoAcessoEm)}`} · editar ▾
                    </span>
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
                    <FormAcao acao={acaoEditarPessoa} botao="Salvar">
                      <input type="hidden" name="id" value={p.id} />
                      <CamposPessoa p={p} />
                      <label className="mt-3 flex items-center gap-2 text-sm">
                        <input type="checkbox" name="ativo" defaultChecked={p.ativo} /> Pode entrar no sistema
                      </label>
                    </FormAcao>
                    {p._count.reservas === 0 && (
                      <FormAcao acao={acaoExcluirPessoa} botao="Excluir" classeBotao="btn-perigo" confirmar={`Excluir ${p.nome}?`}>
                        <input type="hidden" name="id" value={p.id} />
                      </FormAcao>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

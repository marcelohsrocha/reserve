import { db } from '@/lib/db';
import { formatarTelefone } from '@/lib/telefone';
import { FormAcao } from '@/components/FormAcao';
import { TelefoneInput } from '@/components/TelefoneInput';
import { acaoCriarPessoa, acaoEditarPessoa, acaoExcluirPessoa } from '../acoes';

export default async function Pessoas({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const digitos = q.replace(/\D/g, '');
  const pessoas = await db.pessoa.findMany({
    where: q ? { OR: [{ nome: { contains: q } }, ...(digitos ? [{ telefoneE164: { contains: digitos } }] : [])] } : {},
    orderBy: { nome: 'asc' },
    include: { _count: { select: { reservas: true } } },
  });
  return (
    <div className="space-y-6">
      <h1 className="titulo-pagina">Pessoas</h1>
      <section className="cartao">
        <h2 className="mb-3 font-semibold">Nova pessoa</h2>
        <FormAcao acao={acaoCriarPessoa} botao="Cadastrar">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="rotulo">Nome</label>
              <input name="nome" required maxLength={100} className="campo" />
            </div>
            <div>
              <label className="rotulo">Telefone</label>
              <TelefoneInput />
            </div>
          </div>
        </FormAcao>
      </section>

      <section className="cartao space-y-3">
        <form className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nome ou telefone" className="campo" />
          <button className="btn-secundario">Buscar</button>
        </form>
        {pessoas.length === 0 ? (
          <p className="text-slate-600">Nenhuma pessoa encontrada.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pessoas.map((p) => (
              <li key={p.id} className="py-2">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong>{p.nome}</strong> · {formatarTelefone(p.telefoneE164)}
                    </span>
                    <span className="text-xs text-slate-500">{p._count.reservas} reserva(s) · editar ▾</span>
                  </summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_auto]">
                    <FormAcao acao={acaoEditarPessoa} botao="Salvar">
                      <input type="hidden" name="id" value={p.id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <input name="nome" defaultValue={p.nome} required className="campo" />
                        <TelefoneInput defaultValue={p.telefoneE164.replace(/^\+55/, '')} />
                      </div>
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

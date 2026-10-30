'use client';
import { startTransition, useActionState } from 'react';
import type { Estado } from '@/app/admin/acoes';

type Acao = (prev: Estado | null, fd: FormData) => Promise<Estado>;

/** Formulário ligado a uma server action, exibindo erro/sucesso e detalhes (ex.: conflitos). */
export function FormAcao({
  acao,
  children,
  botao,
  classeBotao = 'btn-primario',
  confirmar,
  className = '',
  inline = false,
}: {
  acao: Acao;
  children?: React.ReactNode;
  botao: string;
  classeBotao?: string;
  confirmar?: string;
  className?: string;
  inline?: boolean;
}) {
  const [estado, enviar, pendente] = useActionState(acao, null);
  return (
    <form
      className={inline ? `inline ${className}` : `space-y-3 ${className}`}
      onSubmit={(e) => {
        // Envio manual: o React 19 limparia os campos após uma action de <form>, perdendo o que foi digitado em caso de erro.
        e.preventDefault();
        if (confirmar && !window.confirm(confirmar)) return;
        const fd = new FormData(e.currentTarget);
        startTransition(() => enviar(fd));
      }}
    >
      {children}
      <button type="submit" className={classeBotao} disabled={pendente}>
        {pendente ? 'Aguarde…' : botao}
      </button>
      <Mensagem estado={estado} />
    </form>
  );
}

export function Mensagem({ estado }: { estado: Estado | null }) {
  if (!estado?.mensagem && !estado?.detalhes?.length) return null;
  return (
    <div
      role="status"
      className={`mt-2 rounded-lg border px-3 py-2 text-sm ${estado.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}
    >
      {estado.mensagem && <p className="font-medium">{estado.mensagem}</p>}
      {estado.detalhes && estado.detalhes.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {estado.detalhes.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

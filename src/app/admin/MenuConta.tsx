import { FormAcao } from '@/components/FormAcao';
import { acaoDesconectarAgenda } from './acoes';

/** Menu da conta logada: papel, situação da agenda pessoal e sair. */
export function MenuConta({ nome, email, admin, agendaConectada }: { nome: string; email: string; admin: boolean; agendaConectada: boolean }) {
  const iniciais = nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  return (
    <details className="relative ml-1">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full py-1 pl-1 pr-3 hover:bg-slate-100">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-igreja-claro text-xs font-bold text-igreja">{iniciais}</span>
        <span className="hidden max-w-[10rem] truncate text-slate-700 md:inline">{nome.split(' ')[0]}</span>
      </summary>
      <div className="absolute right-0 mt-2 w-72 space-y-3 rounded-2xl bg-white p-4 text-sm shadow-suave ring-1 ring-slate-100">
        <div>
          <p className="font-semibold">{nome}</p>
          <p className="truncate text-slate-500">{email}</p>
          <span className={`etiqueta mt-2 ${admin ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{admin ? 'Administrador' : 'Membro'}</span>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          {agendaConectada ? (
            <>
              <p className="text-slate-700">📅 Suas reservas são copiadas para a sua Agenda Google.</p>
              <FormAcao acao={acaoDesconectarAgenda} botao="Desconectar agenda" classeBotao="mt-2 text-xs text-slate-500 underline" confirmar="Parar de copiar as reservas para a sua Agenda Google?" />
            </>
          ) : (
            <a href="/api/auth/google?consentir=1" className="text-igreja underline">Conectar a Agenda Google</a>
          )}
        </div>
        <form action="/api/auth/sair" method="post">
          <button className="btn-secundario w-full">Sair</button>
        </form>
      </div>
    </details>
  );
}

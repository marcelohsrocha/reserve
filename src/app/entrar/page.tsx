import { redirect } from 'next/navigation';
import { usuarioOpcional } from '@/lib/usuario';
import { env } from '@/lib/env';
import { destinoSeguro } from '@/lib/login';

export const dynamic = 'force-dynamic';

const ERROS: Record<string, string> = {
  'nao-autorizado': 'Esta conta Google não tem acesso. Peça à secretaria da igreja para cadastrar o seu e-mail.',
  cancelado: 'O login foi cancelado.',
  sessao: 'O login expirou. Tente de novo.',
  falha: 'Não foi possível entrar com o Google agora. Tente novamente em instantes.',
};

function LogoGoogle() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export default async function Entrar({ searchParams }: { searchParams: Promise<{ erro?: string; volta?: string; saiu?: string }> }) {
  const sp = await searchParams;
  const volta = destinoSeguro(sp.volta);
  if (await usuarioOpcional()) redirect(volta);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="cartao w-full max-w-sm space-y-6 text-center">
        <div className="space-y-3">
          <img src="/logo.svg" alt="" className="mx-auto h-14 w-14 rounded-2xl" />
          <div>
            <h1 className="text-xl font-bold">Reservas de Salas</h1>
            <p className="text-sm text-slate-500">Igreja Presbiteriana Independente de Dourados</p>
          </div>
        </div>
        {sp.erro && <p className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 ring-1 ring-red-200">{ERROS[sp.erro] ?? ERROS.falha}</p>}
        {sp.saiu && !sp.erro && <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">Você saiu do sistema.</p>}

        {env.loginDev ? (
          <form action="/api/auth/dev" method="post" className="space-y-3 text-left">
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs text-amber-900 ring-1 ring-amber-200">
              Modo de desenvolvimento: sem GOOGLE_OAUTH_CLIENT_ID o login é simulado pelo e-mail.
            </p>
            <input type="hidden" name="volta" value={volta} />
            <label className="rotulo" htmlFor="email">E-mail da conta Google</label>
            <input id="email" name="email" type="email" required className="campo" placeholder="nome@gmail.com" />
            <button className="btn-primario w-full">Entrar (simulado)</button>
          </form>
        ) : (
          <a href={`/api/auth/google?volta=${encodeURIComponent(volta)}`} className="btn-secundario w-full gap-3 py-3">
            <LogoGoogle /> Entrar com Google
          </a>
        )}
        <p className="text-xs leading-relaxed text-slate-500">
          Ao entrar, você autoriza o sistema a colocar as suas reservas na sua Agenda Google. Apenas eventos criados pelo
          sistema são gravados; nada da sua agenda é lido.
        </p>
      </div>
    </main>
  );
}

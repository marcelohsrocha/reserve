import { redirect } from 'next/navigation';
import { usuarioOpcional } from '@/lib/usuario';
import { destinoSeguro } from '@/lib/login';
import { FormAcao } from '@/components/FormAcao';
import { TelefoneInput } from '@/components/TelefoneInput';
import { acaoDefinirTelefone } from '@/app/admin/acoes';

export const dynamic = 'force-dynamic';

export default async function PrimeiroAcesso({ searchParams }: { searchParams: Promise<{ volta?: string }> }) {
  const u = await usuarioOpcional();
  if (!u) redirect('/entrar');
  const volta = destinoSeguro((await searchParams).volta);
  if (u.telefoneE164) redirect(volta);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="cartao w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-xl font-bold">Olá, {u.nome.split(' ')[0]}!</h1>
          <p className="mt-1 text-sm text-slate-600">
            Para terminar o cadastro, informe o seu celular. Na hora de usar a sala você confirma a presença pelo QR Code da
            porta digitando os <strong>4 últimos dígitos</strong> dele.
          </p>
        </div>
        <FormAcao acao={acaoDefinirTelefone} botao="Continuar" classeBotao="btn-primario w-full">
          <input type="hidden" name="volta" value={volta} />
          <label className="rotulo">Celular</label>
          <TelefoneInput />
          <p className="mt-2 text-xs text-slate-500">O número completo só é visto pela administração; nos painéis ele aparece mascarado.</p>
        </FormAcao>
      </div>
    </main>
  );
}

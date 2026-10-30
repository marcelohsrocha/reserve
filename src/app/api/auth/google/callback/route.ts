import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { trocarCodigo } from '@/integrations/google/oauth';
import { AcessoNegado, entrarComGoogle } from '@/services/pessoas';
import { copiarReservasFuturas } from '@/services/agenda-pessoal';
import { COOKIE_OAUTH, concluirLogin, destinoSeguro, irPara } from '@/lib/login';

export const dynamic = 'force-dynamic';

function mesmoValor(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  let salvo: { state?: string; volta?: string; consentir?: boolean } = {};
  try {
    salvo = JSON.parse(req.cookies.get(COOKIE_OAUTH)?.value ?? '{}');
  } catch {
    // cookie adulterado
  }
  const code = p.get('code');
  const state = p.get('state') ?? '';
  if (p.get('error') === 'access_denied') return irPara('/entrar?erro=cancelado');
  if (!code || !salvo.state || !mesmoValor(state, salvo.state)) return irPara('/entrar?erro=sessao');
  const volta = destinoSeguro(salvo.volta);

  try {
    const conta = await trocarCodigo(code);
    const { pessoa, conectouAgora } = await entrarComGoogle(conta);
    // Autorizou a agenda mas o Google não mandou refresh token (já havia consentido antes e o
    // token foi perdido): pede o consentimento de novo, uma única vez.
    if (conta.agendaAutorizada && !pessoa.googleRefreshToken && !salvo.consentir) {
      return irPara(`/api/auth/google?consentir=1&volta=${encodeURIComponent(volta)}`);
    }
    if (conectouAgora) await copiarReservasFuturas(pessoa.id);
    const res = await concluirLogin(pessoa, volta);
    res.cookies.delete({ name: COOKIE_OAUTH, path: '/api/auth' });
    return res;
  } catch (e) {
    if (e instanceof AcessoNegado) return irPara('/entrar?erro=nao-autorizado');
    console.error('[login] falha no retorno do Google', e);
    return irPara('/entrar?erro=falha');
  }
}

import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { trocarCodigo } from '@/integrations/google/oauth';
import { AcessoNegado, entrarComGoogle } from '@/services/pessoas';
import { COOKIE_OAUTH, concluirLogin, destinoSeguro, irPara } from '@/lib/login';

export const dynamic = 'force-dynamic';

function mesmoValor(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  let salvo: { state?: string; volta?: string } = {};
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
    const { pessoa } = await entrarComGoogle(conta);
    const res = await concluirLogin(pessoa, volta);
    res.cookies.delete({ name: COOKIE_OAUTH, path: '/api/auth' });
    return res;
  } catch (e) {
    if (e instanceof AcessoNegado) return irPara('/entrar?erro=nao-autorizado');
    console.error('[login] falha no retorno do Google', e);
    return irPara('/entrar?erro=falha');
  }
}

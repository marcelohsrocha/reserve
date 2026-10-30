import { COOKIE_SESSAO } from '@/lib/sessao';
import { irPara } from '@/lib/login';

export const dynamic = 'force-dynamic';

export async function POST() {
  const res = irPara('/entrar?saiu=1');
  res.cookies.delete(COOKIE_SESSAO);
  return res;
}

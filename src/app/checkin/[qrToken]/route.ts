import type { NextRequest } from 'next/server';
import {
  confirmarCheckin,
  encerrarPelaPorta,
  podeAgirSemDigitos,
  situacaoCheckin,
  type Credencial,
  type ResultadoCheckin,
  type SituacaoCheckin,
} from '@/services/checkin';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';
import { db } from '@/lib/db';
import { dataBR, horaLocal, dataLocal } from '@/lib/tempo';

export const dynamic = 'force-dynamic';

/**
 * Página pública do QR da porta. HTML puro (sem JavaScript nem framework) para carregar
 * rápido em 4G fraco: ~3 KB por requisição.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function quando(d: Date, agora: Date) {
  return dataLocal(d) === dataLocal(agora) ? `hoje às ${horaLocal(d)}` : `${dataBR(d)} às ${horaLocal(d)}`;
}

function pagina(corpo: string, cor: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Check-in · IPI Dourados</title><style>
*{box-sizing:border-box}body{margin:0;font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f1f5f9;color:#0f172a}
.t{background:${cor};color:#fff;padding:20px 16px;text-align:center}.t b{display:block;font-size:44px;line-height:1;letter-spacing:1px}.t span{font-size:15px;opacity:.95}
main{max-width:440px;margin:0 auto;padding:16px}.c{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px #0001;margin-bottom:14px}
h1{font-size:22px;margin:0 0 6px}p{margin:6px 0}.m{color:#475569;font-size:14px}
input{width:100%;font-size:32px;letter-spacing:12px;text-align:center;padding:12px;border:2px solid #cbd5e1;border-radius:12px;margin:10px 0}
button{width:100%;font-size:18px;font-weight:700;padding:14px;border:0;border-radius:12px;background:#1f4e79;color:#fff}
.b2{background:#fff;color:#334155;border:2px solid #cbd5e1;margin-top:8px}.s{font-size:14px;color:#475569;text-align:center;margin:8px 0 0}.s a{color:#1f4e79}
.e{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:10px}.ok{background:#dcfce7;color:#166534;padding:14px;border-radius:10px;font-weight:600;text-align:center;font-size:18px}
footer{text-align:center;color:#94a3b8;font-size:12px;padding:8px}</style></head><body>${corpo}<footer>IPI Dourados · Reservas de Salas</footer></body></html>`;
}

function topo(sit: Exclude<SituacaoCheckin, { tipo: 'INDISPONIVEL' }>, cor: string, estado: string) {
  return `<div class="t" style="background:${cor}"><b>${esc(sit.sala.codigo)}</b><span>${esc(sit.sala.nome)} · ${esc(sit.sala.andar)}</span><br><span><strong>${estado}</strong></span></div>`;
}

type Motivo = Exclude<ResultadoCheckin, { ok: true }>['motivo'];
const MSG_ERRO: Record<Motivo, string> = {
  DIGITOS: 'Os dígitos não conferem com o telefone do responsável. Tente novamente.',
  LIMITE: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.',
  INDISPONIVEL: 'Não há reserva em andamento nesta sala agora.',
  JA_CONFIRMADA: 'A presença já foi confirmada.',
  SEM_PERMISSAO: 'Sua conta não é a do responsável por esta reserva. Use os 4 dígitos do telefone dele.',
  NAO_COMECOU: 'A reserva ainda não começou.',
};

/** Quem está vendo a página (sessão do sistema, se houver) e se pode agir com 1 toque. */
interface Visitante {
  pessoaId: string | null;
  nome: string | null;
  umToque: boolean;
}

interface Retorno {
  acao: 'checkin' | 'encerrar';
  ok: boolean;
  motivo?: Motivo;
  em?: Date;
}

function campoDigitos(id: string, autofocus: boolean) {
  return `<input id="${id}" name="digitos" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required${autofocus ? ' autofocus' : ''}>`;
}

function renderizar(sit: SituacaoCheckin, agora: Date, token: string, v: Visitante, ret?: Retorno) {
  const acaoUrl = `/checkin/${encodeURIComponent(token)}`;
  const erro = ret && !ret.ok && ret.motivo ? `<p class="e">${MSG_ERRO[ret.motivo]}</p>` : '';

  if (sit.tipo === 'INDISPONIVEL') {
    return pagina(
      `<div class="t" style="background:#475569"><b>—</b></div><main><div class="c"><h1>Sala indisponível</h1><p class="m">Este QR Code não está mais ativo. Procure a secretaria da igreja.</p></div></main>`,
      '#475569',
    );
  }
  if (sit.tipo === 'BLOQUEADA') {
    return pagina(
      `${topo(sit, '#64748b', 'BLOQUEADA')}<main><div class="c"><h1>Sala bloqueada – ${esc(sit.motivo)}</h1><p class="m">Até ${quando(sit.ate, agora)}.</p></div></main>`,
      '#64748b',
    );
  }
  if (sit.tipo === 'LIVRE') {
    const liberou = ret?.acao === 'encerrar' && ret.ok && ret.em ? `<div class="ok">✓ Sala liberada às ${horaLocal(ret.em)}. Obrigado!</div>` : '';
    const prox = sit.proximo
      ? `<p class="m">Próximo agendamento: <strong>${esc(sit.proximo.titulo)}</strong>, ${quando(sit.proximo.inicio, agora)}–${horaLocal(sit.proximo.fim)}.</p>`
      : '<p class="m">Nenhum agendamento futuro.</p>';
    return pagina(`${topo(sit, '#059669', 'LIVRE')}<main>${liberou}<div class="c"><h1>Sala livre agora</h1>${prox}</div></main>`, '#059669');
  }

  const o = sit.ocorrencia;
  const confirmada = o.status === 'CONFIRMADA' || (ret?.acao === 'checkin' && ret.ok);
  const comecou = o.inicio <= agora;
  const cor = confirmada ? '#dc2626' : '#d97706';
  const info = `<div class="c"><h1>${esc(o.titulo)}</h1><p>${horaLocal(o.inicio)} – ${horaLocal(o.fim)}</p><p class="m">Responsável: ${esc(sit.responsavel)} · ${esc(sit.telefoneMascarado)}</p></div>`;
  const quem = v.umToque && v.nome ? `<p class="s">Você entrou como ${esc(v.nome)}.</p>` : '';
  const convite = !v.pessoaId ? `<p class="s"><a href="/entrar?volta=${encodeURIComponent(acaoUrl)}">Entrar com Google</a> para confirmar com 1 toque.</p>` : '';

  // Encerrar mais cedo (só depois do início).
  const encerrar = !comecou
    ? ''
    : v.umToque
      ? `<form method="post" action="${acaoUrl}" onsubmit="return confirm('Encerrar agora e liberar a sala?')"><input type="hidden" name="acao" value="encerrar"><button class="b2">Encerrar agora e liberar a sala</button></form>`
      : `<details class="c"><summary><strong>Terminou mais cedo?</strong></summary><form method="post" action="${acaoUrl}"><input type="hidden" name="acao" value="encerrar"><label for="d2" class="m">Digite os 4 últimos dígitos do telefone do responsável para liberar a sala.</label>${ret?.acao === 'encerrar' ? erro : ''}${campoDigitos('d2', false)}<button class="b2">Encerrar agora e liberar a sala</button></form></details>`;

  if (confirmada) {
    const hora = ret?.acao === 'checkin' && ret.ok ? ret.em : o.checkinEm;
    return pagina(
      `${topo(sit, cor, 'OCUPADA')}<main>${info}<div class="ok">✓ Presença confirmada${hora ? ` às ${horaLocal(hora)}` : ''}</div>${v.umToque ? `<div class="c">${encerrar}${quem}</div>` : encerrar}</main>`,
      cor,
    );
  }

  const erroCheckin = ret?.acao === 'checkin' ? erro : '';
  const form = v.umToque
    ? `<form method="post" action="${acaoUrl}" class="c"><input type="hidden" name="acao" value="checkin">${erroCheckin}<button>Confirmar presença</button>${quem}</form>`
    : `<form method="post" action="${acaoUrl}" class="c"><input type="hidden" name="acao" value="checkin"><label for="d"><strong>Confirme sua presença</strong><br><span class="m">Digite os 4 últimos dígitos do telefone do responsável.</span></label>${erroCheckin}${campoDigitos('d', true)}<button>Confirmar presença</button>${convite}</form>`;
  const encerrarBloco = v.umToque && encerrar ? `<div class="c">${encerrar}</div>` : encerrar;
  return pagina(`${topo(sit, cor, 'AGUARDANDO CHECK-IN')}<main>${info}${form}${encerrarBloco}</main>`, cor);
}

const cabecalhos = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

async function visitante(req: NextRequest, sit: SituacaoCheckin): Promise<Visitante> {
  let pessoaId: string | null = null;
  try {
    pessoaId = (await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value))?.pessoaId ?? null;
  } catch {
    // SESSION_SECRET ausente: página continua funcionando com os dígitos.
  }
  if (!pessoaId) return { pessoaId: null, nome: null, umToque: false };
  const p = await db.pessoa.findUnique({ where: { id: pessoaId }, select: { nome: true, ativo: true } });
  if (!p?.ativo) return { pessoaId: null, nome: null, umToque: false };
  const umToque = sit.tipo === 'RESERVA' && (await podeAgirSemDigitos(pessoaId, sit.responsavelId));
  return { pessoaId, nome: p.nome, umToque };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const agora = new Date();
  const sit = await situacaoCheckin(qrToken, agora);
  return new Response(renderizar(sit, agora, qrToken, await visitante(req, sit)), { headers: cabecalhos });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const fd = await req.formData();
  const agora = new Date();
  const antes = await situacaoCheckin(qrToken, agora);
  const v = await visitante(req, antes);
  const digitos = fd.get('digitos');
  // Com dígitos informados, vale o que foi digitado; sem eles, a sessão (1 toque).
  const cred: Credencial | null = digitos !== null ? { digitos: String(digitos), ip } : v.umToque && v.pessoaId ? { pessoaId: v.pessoaId } : null;
  const acao = fd.get('acao') === 'encerrar' ? 'encerrar' : 'checkin';

  let ret: Retorno;
  if (!cred) ret = { acao, ok: false, motivo: 'SEM_PERMISSAO' };
  else if (acao === 'encerrar') {
    const r = await encerrarPelaPorta(qrToken, cred, agora);
    ret = r.ok ? { acao, ok: true, em: r.em } : { acao, ok: false, motivo: r.motivo };
  } else {
    const r = await confirmarCheckin(qrToken, cred, agora);
    ret = r.ok ? { acao, ok: true, em: r.checkinEm } : { acao, ok: false, motivo: r.motivo };
  }
  const sit = await situacaoCheckin(qrToken, agora);
  return new Response(renderizar(sit, agora, qrToken, await visitante(req, sit), ret), {
    status: !ret.ok && ret.motivo === 'LIMITE' ? 429 : 200,
    headers: cabecalhos,
  });
}

import { confirmarCheckin, situacaoCheckin, type ResultadoCheckin, type SituacaoCheckin } from '@/services/checkin';
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
.e{background:#fee2e2;color:#991b1b;padding:10px 12px;border-radius:10px}.ok{background:#dcfce7;color:#166534;padding:14px;border-radius:10px;font-weight:600;text-align:center;font-size:18px}
footer{text-align:center;color:#94a3b8;font-size:12px;padding:8px}</style></head><body>${corpo}<footer>IPI Dourados · Reservas de Salas</footer></body></html>`;
}

function topo(sit: Exclude<SituacaoCheckin, { tipo: 'INDISPONIVEL' }>, cor: string, estado: string) {
  return `<div class="t" style="background:${cor}"><b>${esc(sit.sala.codigo)}</b><span>${esc(sit.sala.nome)} · ${esc(sit.sala.andar)}</span><br><span><strong>${estado}</strong></span></div>`;
}

const MSG_ERRO: Record<Exclude<ResultadoCheckin, { ok: true }>['motivo'], string> = {
  DIGITOS: 'Os dígitos não conferem com o telefone do responsável. Tente novamente.',
  LIMITE: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.',
  INDISPONIVEL: 'Não há reserva aguardando check-in nesta sala agora.',
  JA_CONFIRMADA: 'A presença já foi confirmada.',
};

function renderizar(sit: SituacaoCheckin, agora: Date, token: string, resultado?: ResultadoCheckin) {
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
    const prox = sit.proximo
      ? `<p class="m">Próximo agendamento: <strong>${esc(sit.proximo.titulo)}</strong>, ${quando(sit.proximo.inicio, agora)}–${horaLocal(sit.proximo.fim)}.</p>`
      : '<p class="m">Nenhum agendamento futuro.</p>';
    return pagina(`${topo(sit, '#059669', 'LIVRE')}<main><div class="c"><h1>Sala livre agora</h1>${prox}</div></main>`, '#059669');
  }

  const o = sit.ocorrencia;
  const confirmada = o.status === 'CONFIRMADA' || resultado?.ok;
  const cor = confirmada ? '#dc2626' : '#d97706';
  const info = `<div class="c"><h1>${esc(o.titulo)}</h1><p>${horaLocal(o.inicio)} – ${horaLocal(o.fim)}</p><p class="m">Responsável: ${esc(sit.responsavel)} · ${esc(sit.telefoneMascarado)}</p></div>`;
  if (confirmada) {
    const hora = resultado?.ok ? resultado.checkinEm : o.checkinEm;
    return pagina(`${topo(sit, cor, 'OCUPADA')}<main>${info}<div class="ok">✓ Presença confirmada${hora ? ` às ${horaLocal(hora)}` : ''}</div></main>`, cor);
  }
  const erro = resultado && !resultado.ok ? `<p class="e">${MSG_ERRO[resultado.motivo]}</p>` : '';
  const form = `<form method="post" action="/checkin/${encodeURIComponent(token)}" class="c"><label for="d"><strong>Confirme sua presença</strong><br><span class="m">Digite os 4 últimos dígitos do telefone do responsável.</span></label>${erro}<input id="d" name="digitos" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="off" required autofocus><button>Confirmar presença</button></form>`;
  return pagina(`${topo(sit, cor, 'AGUARDANDO CHECK-IN')}<main>${info}${form}</main>`, cor);
}

const cabecalhos = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
  'Referrer-Policy': 'no-referrer',
};

export async function GET(_: Request, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const agora = new Date();
  return new Response(renderizar(await situacaoCheckin(qrToken, agora), agora, qrToken), { headers: cabecalhos });
}

export async function POST(req: Request, { params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params;
  const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const fd = await req.formData();
  const agora = new Date();
  const resultado = await confirmarCheckin(qrToken, String(fd.get('digitos') ?? ''), ip, agora);
  const sit = await situacaoCheckin(qrToken, agora);
  return new Response(renderizar(sit, agora, qrToken, resultado), {
    status: resultado.ok || resultado.motivo === 'JA_CONFIRMADA' ? 200 : resultado.motivo === 'LIMITE' ? 429 : 200,
    headers: cabecalhos,
  });
}

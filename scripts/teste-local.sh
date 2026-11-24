#!/bin/bash
# Teste local do Sistema de Reservas – IPI Dourados (sem Google, sem Docker).
# Uso: npm run teste:local            (mantém os dados da última vez)
#      npm run teste:local -- --zerar (apaga e recria a demonstração)
set -e
cd "$(dirname "$0")/.."
# Tudo que aparece no Terminal também vai para teste-local.log (ajuda a diagnosticar).
exec > >(tee teste-local.log) 2>&1
echo "== $(date) =="

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js não encontrado. Instale a versão LTS em https://nodejs.org e rode de novo."
  exit 1
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  echo "❌ Node.js $(node -v) é antigo. Instale a versão LTS (20 ou mais nova) em https://nodejs.org."
  exit 1
fi

if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "📦 Instalando dependências (só na primeira vez)…"
  npm install --no-audit --no-fund
  touch node_modules
fi
npx prisma generate >/dev/null

BANCO=prisma/teste-local.db
if [ "$1" = "--zerar" ]; then rm -f "$BANCO" "$BANCO-wal" "$BANCO-shm" "$BANCO-journal"; fi

# Ambiente só deste teste: banco separado, Google falso e login simulado (o .env não é usado para isso).
export NODE_ENV=development
export DATABASE_URL="file:./teste-local.db"
export GOOGLE_FAKE=1
export GOOGLE_OAUTH_CLIENT_ID=""
export GOOGLE_OAUTH_CLIENT_SECRET=""
export ADMIN_EMAILS="admin@dev.local"
export SESSION_SECRET="teste-local-$(date +%s)-$RANDOM"
# Primeira porta livre a partir da 3000 (outro projeto pode estar usando a 3000).
PORTA=3000
while [ $PORTA -lt 3020 ] && (lsof -nP -iTCP:$PORTA -sTCP:LISTEN >/dev/null 2>&1 || (echo > /dev/tcp/127.0.0.1/$PORTA) >/dev/null 2>&1); do
  echo "ℹ️  Porta $PORTA ocupada por outro programa; tentando a próxima."
  PORTA=$((PORTA + 1))
done
IP=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null || true)
export PUBLIC_BASE_URL="http://${IP:-localhost}:${PORTA}"
export TESTE_LOCAL_HOST="${IP:-localhost}"

if [ ! -f "$BANCO" ]; then
  echo "🗄️  Criando banco de teste…"
  node -e '
    const D = require("better-sqlite3"), fs = require("fs"), p = "prisma/migrations";
    const b = new D(process.argv[1]);
    for (const m of fs.readdirSync(p).filter((n) => /^\d+_/.test(n)).sort()) b.exec(fs.readFileSync(`${p}/${m}/migration.sql`, "utf8"));
    b.close();' "$BANCO"
  npx tsx scripts/demo-local.ts
fi

cat <<MSG

✅ Sistema de teste subindo em ${PUBLIC_BASE_URL}  (use sempre este endereço)

   Entre com um destes e-mails (login simulado, sem senha):
     admin@dev.local   → administrador (telefone final 0000)
     maria@dev.local   → membro        (telefone final 1111)
     jose@dev.local    → membro        (telefone final 2222)

   Telas:  /painel  ·  /disponiveis  ·  /admin  ·  /admin/reservas/nova  ·  /admin/qrcodes
MSG
if [ -n "$IP" ]; then
  echo "   📱 No celular (mesmo Wi-Fi): abra ${PUBLIC_BASE_URL} — os QR Codes impressos também funcionam."
fi
echo "   Para parar: Ctrl+C"
echo

# Sobe o servidor em segundo plano para poder "aquecer" as telas antes de abrir o navegador.
npx next dev -H 0.0.0.0 -p "$PORTA" &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null; exit 0' INT TERM

BASE="http://127.0.0.1:${PORTA}"
for _ in $(seq 1 60); do curl -s -o /dev/null "$BASE/api/health" && break; sleep 1; done

# No modo de teste, cada tela é montada na primeira visita e o navegador recarrega quando isso
# acontece — se for no meio do login, ele volta para a tela de entrada. Por isso o script entra
# sozinho uma vez e visita as telas principais ANTES de abrir o navegador.
echo "⏳ Preparando as telas (uns 20 segundos na primeira vez)…"
COOKIES=$(mktemp)
curl -s -o /dev/null -c "$COOKIES" "$BASE/entrar"
curl -s -o /dev/null -b "$COOKIES" -c "$COOKIES" -X POST --data-urlencode "email=admin@dev.local" "$BASE/api/auth/dev"
for TELA in /admin /painel /disponiveis /admin/reservas /admin/reservas/nova /admin/agenda /admin/salas /admin/pessoas /admin/qrcodes /admin/configuracoes /admin/auditoria /api/painel; do
  curl -s -o /dev/null -b "$COOKIES" "$BASE$TELA" || true
done
SALA=$(node -e '
  const D = require("better-sqlite3"); const b = new D("prisma/teste-local.db", { readonly: true });
  const s = b.prepare("select id, qrToken from Sala where ativa = 1 order by numero limit 1").get();
  if (s) console.log(s.id + " " + s.qrToken);' 2>/dev/null || true)
if [ -n "$SALA" ]; then
  curl -s -o /dev/null -b "$COOKIES" "$BASE/admin/salas/${SALA%% *}" || true
  curl -s -o /dev/null "$BASE/checkin/${SALA##* }" || true
fi
rm -f "$COOKIES"
echo "✅ Pronto! Abrindo ${PUBLIC_BASE_URL}/entrar"
echo

if command -v open >/dev/null 2>&1; then open "${PUBLIC_BASE_URL}/entrar" >/dev/null 2>&1 || true; fi
wait $SERVIDOR || { echo; echo "❌ O servidor parou com erro. Mande o arquivo teste-local.log para o suporte."; exit 1; }

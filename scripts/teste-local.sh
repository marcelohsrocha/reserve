#!/bin/bash
# Teste local do Sistema de Reservas – IPI Dourados (sem Google, sem Docker).
# Uso: npm run teste:local            (mantém os dados da última vez)
#      npm run teste:local -- --zerar (apaga e recria a demonstração)
set -e
cd "$(dirname "$0")/.."

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
IP=$( (ipconfig getifaddr en0 || ipconfig getifaddr en1) 2>/dev/null || true)
export PUBLIC_BASE_URL="http://${IP:-localhost}:3000"

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

✅ Sistema de teste subindo em ${PUBLIC_BASE_URL}

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

if command -v open >/dev/null 2>&1; then (sleep 8 && open "${PUBLIC_BASE_URL}/entrar") >/dev/null 2>&1 & fi
exec npx next dev -H 0.0.0.0 -p 3000

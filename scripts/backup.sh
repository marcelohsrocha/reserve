#!/bin/bash
# Backup consistente do banco (funciona com o sistema rodando).
# Uso, na pasta do projeto no servidor: ./scripts/backup.sh
# Mantém os 30 backups mais recentes em ./backups.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backups
DESTINO="backups/reservas-$(date +%F_%H%M).db"

# Cópia feita pelo próprio SQLite dentro do container (não corrompe se houver gravação no meio).
docker compose exec -T app node -e "
  const Database = require('better-sqlite3');
  Database('/app/data/reservas.db', { readonly: true })
    .backup('/app/data/backup-temp.db')
    .then(() => console.log('cópia ok'))
    .catch((e) => { console.error(e); process.exit(1); });
"
docker compose cp app:/app/data/backup-temp.db "$DESTINO"
docker compose exec -T app rm -f /app/data/backup-temp.db
chmod 600 "$DESTINO"

# Apaga os mais antigos, mantendo 30.
ls -1t backups/reservas-*.db 2>/dev/null | tail -n +31 | xargs -r rm -f
echo "✅ Backup salvo em $DESTINO ($(du -h "$DESTINO" | cut -f1))"

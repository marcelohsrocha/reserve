#!/bin/sh
set -e
# Aplica as migrações pendentes do banco SQLite (no volume /app/data) e inicia o app.
prisma migrate deploy --schema ./prisma/schema.prisma
exec node server.js

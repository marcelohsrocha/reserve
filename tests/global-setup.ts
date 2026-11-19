import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/**
 * Recria o banco descartável de testes (prisma/test.db) aplicando as migrações SQL em ordem.
 * Não usa o schema engine do Prisma, então roda também sem acesso a binaries.prisma.sh.
 */
export default function setup() {
  const pastaPrisma = path.resolve(__dirname, '../prisma');
  const arquivo = path.join(pastaPrisma, 'test.db');
  for (const sufixo of ['', '-journal', '-wal', '-shm']) rmSync(arquivo + sufixo, { force: true });
  const banco = new Database(arquivo);
  const pastaMigracoes = path.join(pastaPrisma, 'migrations');
  for (const m of readdirSync(pastaMigracoes).filter((n) => /^\d+_/.test(n)).sort()) {
    banco.exec(readFileSync(path.join(pastaMigracoes, m, 'migration.sql'), 'utf8'));
  }
  banco.close();
}

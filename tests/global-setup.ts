import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

/** Recria o banco descartável de testes (prisma/test.db) a partir do schema. */
export default function setup() {
  for (const sufixo of ['', '-journal']) rmSync(path.resolve(__dirname, `../prisma/test.db${sufixo}`), { force: true });
  execSync('npx prisma db push --skip-generate', {
    env: { ...process.env, DATABASE_URL: 'file:./test.db', PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
}

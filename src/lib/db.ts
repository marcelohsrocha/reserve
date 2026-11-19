import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';

/**
 * Prisma sem motor Rust (engineType = "client"): as consultas passam pelo driver
 * better-sqlite3. Não depende do download de binários do Prisma no build.
 *
 * Caminhos relativos (`file:./dev.db`) continuam relativos à pasta `prisma/`,
 * como no comportamento clássico do Prisma.
 */
export function caminhoBanco(url = process.env.DATABASE_URL ?? 'file:./dev.db') {
  const arquivo = url.replace(/^file:/, '');
  return path.isAbsolute(arquivo) ? arquivo : path.resolve(process.cwd(), 'prisma', arquivo);
}

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const db = g.__prisma ?? new PrismaClient({ adapter: new PrismaBetterSQLite3({ url: caminhoBanco() }) });
if (process.env.NODE_ENV !== 'production') g.__prisma = db;

export type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

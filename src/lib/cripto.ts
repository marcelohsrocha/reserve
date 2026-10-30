import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from './env';

/** AES-256-GCM para guardar os refresh tokens do Google cifrados no banco. */
function chave() {
  if (!env.sessionSecret) throw new Error('SESSION_SECRET não configurado.');
  return createHash('sha256').update(`refresh-token:${env.sessionSecret}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', chave(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), dados.toString('base64url')].join('.');
}

export function decifrar(valor: string): string {
  const [versao, iv, tag, dados] = valor.split('.');
  if (versao !== 'v1' || !iv || !tag || !dados) throw new Error('Token cifrado inválido.');
  const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(dados, 'base64url')), d.final()]).toString('utf8');
}

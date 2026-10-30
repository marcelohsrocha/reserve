/**
 * Seed SOMENTE para desenvolvimento: 3 salas e 2 pessoas fictícias.
 * Em produção o sistema sobe sem salas; este script se recusa a rodar com NODE_ENV=production.
 */
import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

if (process.env.NODE_ENV === 'production') {
  console.error('seed:dev não pode ser executado em produção.');
  process.exit(1);
}

const db = new PrismaClient();

async function main() {
  if ((await db.sala.count()) > 0) {
    console.log('Banco já possui salas; seed ignorado.');
    return;
  }
  const salas = [
    { numero: 1, nome: 'Santuário', andar: 'Térreo' },
    { numero: 2, nome: 'Sala dos Jovens', andar: '1º andar' },
    { numero: 3, nome: 'Sala de Música', andar: '1º andar' },
  ];
  for (const s of salas) {
    await db.numeroSalaUsado.create({ data: { numero: s.numero } });
    await db.sala.create({ data: { ...s, qrToken: randomBytes(18).toString('base64url') } });
  }
  await db.pessoa.createMany({
    data: [
      { nome: 'Maria Exemplo', telefoneE164: '+5567999990001' },
      { nome: 'José Fictício', telefoneE164: '+5567988880002' },
    ],
  });
  await db.corAndar.createMany({ data: [{ andar: 'Térreo', colorId: '9' }, { andar: '1º andar', colorId: '2' }] });
  console.log('Seed de desenvolvimento criado: S01–S03, 2 pessoas.');
}

main().finally(() => db.$disconnect());

/**
 * Dados de DEMONSTRAÇÃO para o teste local (npm run teste:local).
 * Monta o painel com todas as situações em volta do horário atual:
 * ocupada (check-in feito), aguardando check-in, livre até mais tarde, bloqueada e livre.
 * Os horários são relativos a "agora", então a demonstração funciona a qualquer hora.
 * Não toca no Google (as reservas daqui não têm evento lá).
 */
import { db } from '../src/lib/db';
import { criarSala } from '../src/services/salas';
import { criarPessoa } from '../src/services/pessoas';
import { dataLocal, horaLocal } from '../src/lib/tempo';

if (process.env.NODE_ENV === 'production') {
  console.error('A demonstração não pode rodar em produção.');
  process.exit(1);
}

const SISTEMA = 'demo@local';
const agora = new Date();
const min = (n: number) => new Date(agora.getTime() + n * 60_000);
// Arredonda para 5 min (fica com cara de horário real).
const redondo = (d: Date) => new Date(Math.round(d.getTime() / 300_000) * 300_000);

async function reserva(salaId: string, pessoaId: string, titulo: string, datas: { inicio: Date; fim: Date; status?: string; checkinEm?: Date }[]) {
  const primeira = datas[0]!;
  const ultima = datas[datas.length - 1]!;
  return db.reserva.create({
    data: {
      salaId,
      pessoaId,
      titulo,
      dataInicio: dataLocal(primeira.inicio),
      dataFim: dataLocal(ultima.inicio),
      horaInicio: horaLocal(primeira.inicio),
      horaFim: horaLocal(primeira.fim),
      criadoPor: SISTEMA,
      ocorrencias: {
        create: datas.map((d) => ({
          salaId,
          inicioUtc: d.inicio,
          fimUtc: d.fim,
          status: d.status ?? 'AGENDADA',
          checkinEm: d.checkinEm ?? null,
        })),
      },
    },
  });
}

async function main() {
  if ((await db.sala.count()) > 0) {
    console.log('O banco de teste já tem dados; nada a fazer.');
    return;
  }
  // Tolerância longa para a sala amarela não virar "não compareceu" durante a demonstração.
  await db.configuracao.upsert({ where: { id: 1 }, update: { toleranciaCheckinMin: 240 }, create: { id: 1, toleranciaCheckinMin: 240 } });

  const santuario = await criarSala({ nome: 'Santuário', andar: 'Térreo' }, SISTEMA);
  const jovens = await criarSala({ nome: 'Sala dos Jovens', andar: '1º andar' }, SISTEMA);
  const musica = await criarSala({ nome: 'Sala de Música', andar: '1º andar' }, SISTEMA);
  const infantil = await criarSala({ nome: 'Sala Infantil', andar: 'Térreo' }, SISTEMA);
  await criarSala({ nome: 'Sala Pastoral', andar: '2º andar' }, SISTEMA);

  const admin = await criarPessoa({ nome: 'Admin Demonstração', email: 'admin@dev.local', telefone: '(67) 99999-0000', papel: 'ADMIN' }, SISTEMA);
  const maria = await criarPessoa({ nome: 'Maria Exemplo', email: 'maria@dev.local', telefone: '(67) 99999-1111' }, SISTEMA);
  const jose = await criarPessoa({ nome: 'José Exemplo', email: 'jose@dev.local', telefone: '(67) 99999-2222' }, SISTEMA);

  // Vermelho: começou há 30 min, check-in feito.
  await reserva(santuario.id, jose.id, 'Reunião de diáconos', [
    { inicio: redondo(min(-30)), fim: redondo(min(60)), status: 'CONFIRMADA', checkinEm: redondo(min(-25)) },
  ]);
  // Amarelo: começou há 5 min, aguardando check-in.
  await reserva(jovens.id, maria.id, 'Ensaio do louvor', [{ inicio: redondo(min(-5)), fim: redondo(min(90)), status: 'EM_ANDAMENTO' }]);
  // Verde "livre até": próxima reserva daqui a 2 h; mais uma série semanal.
  await reserva(musica.id, maria.id, 'Aula de violão', [{ inicio: redondo(min(120)), fim: redondo(min(180)) }]);
  await reserva(
    musica.id,
    admin.id,
    'Ensaio do coral',
    [7, 14, 21, 28].map((d) => ({ inicio: redondo(min(d * 1440)), fim: redondo(min(d * 1440 + 120)) })),
  );
  // Cinza: bloqueada por reforma.
  await db.bloqueio.create({
    data: { salaId: infantil.id, inicioUtc: redondo(min(-1440)), fimUtc: redondo(min(3 * 1440)), motivo: 'Pintura e reforma', criadoPor: SISTEMA },
  });

  console.log('Demonstração criada: 5 salas, 3 pessoas, reservas em volta do horário atual e 1 bloqueio.');
}

main().finally(() => db.$disconnect());

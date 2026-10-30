import { criarSala } from '@/services/salas';
import { criarPessoa } from '@/services/pessoas';
import { criarReserva } from '@/services/reservas';
import { localParaUtc } from '@/lib/tempo';

export const ADMIN = 'admin@ipi.test';
/** 04/11/2030 é uma segunda-feira. */
export const DIA = '2030-11-04';
export const t = (hora: string, dia = DIA) => localParaUtc(dia, hora);

export async function cenario() {
  const s1 = await criarSala({ nome: 'Santuário', andar: 'Térreo' }, ADMIN);
  const s2 = await criarSala({ nome: 'Sala dos Jovens', andar: '1º andar' }, ADMIN);
  const s3 = await criarSala({ nome: 'Sala de Música', andar: '1º andar' }, ADMIN);
  const ana = await criarPessoa({ nome: 'Ana Souza', telefone: '(67) 99999-1234' }, ADMIN);
  const joao = await criarPessoa({ nome: 'João Lima', telefone: '(67) 98888-5678' }, ADMIN);
  return { s1, s2, s3, ana, joao };
}

export function reservar(salaId: string, pessoaId: string, horaInicio: string, horaFim: string, extra: Partial<Parameters<typeof criarReserva>[0]> = {}) {
  return criarReserva(
    { salaId, pessoaId, titulo: 'Ensaio do louvor', dataInicio: DIA, dataFim: DIA, horaInicio, horaFim, ...extra },
    ADMIN,
    t('08:00'),
  );
}

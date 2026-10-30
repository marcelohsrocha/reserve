import { describe, expect, it } from 'vitest';
import { criarSala, desativarSala, editarSala, excluirSala, proximoNumero } from '@/services/salas';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('não reaproveitamento de número de sala', () => {
  it('sala nova recebe S05 depois que a S04 é desativada', async () => {
    await cenario(); // S01..S03
    const s4 = await criarSala({ nome: 'Berçário', andar: 'Térreo' }, ADMIN);
    expect(s4.numero).toBe(4);
    await desativarSala(s4.id, undefined, ADMIN, t('08:00'));
    expect(await proximoNumero()).toBe(5);
    expect((await criarSala({ nome: 'Berçário novo', andar: 'Térreo' }, ADMIN)).numero).toBe(5);
  });

  it('número de sala excluída (sem histórico) também nunca volta', async () => {
    const { s3 } = await cenario();
    await excluirSala(s3.id, ADMIN);
    expect(await proximoNumero()).toBe(4);
    await expect(criarSala({ numero: 3, nome: 'Outra', andar: 'Térreo' }, ADMIN)).rejects.toThrow(/não pode ser reaproveitado/);
  });

  it('não aceita digitar manualmente um número já usado, nem nome repetido entre ativas', async () => {
    await cenario();
    await expect(criarSala({ numero: 2, nome: 'X', andar: 'Térreo' }, ADMIN)).rejects.toThrow(/S02/);
    await expect(criarSala({ nome: 'santuário', andar: 'Térreo' }, ADMIN)).rejects.toThrow(/Já existe uma sala ativa/);
    expect((await criarSala({ numero: 10, nome: 'Sala 10', andar: '2º andar' }, ADMIN)).numero).toBe(10);
    expect(await proximoNumero()).toBe(11);
  });

  it('não permite alterar o número de sala com reservas futuras; sem elas, o número antigo fica reservado', async () => {
    const { s1, s2, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    await expect(editarSala(s1.id, { numero: 20, nome: s1.nome, andar: s1.andar }, ADMIN, t('08:00'))).rejects.toThrow(/não pode ser alterado/);

    await editarSala(s2.id, { numero: 20, nome: s2.nome, andar: s2.andar }, ADMIN, t('08:00'));
    await expect(criarSala({ numero: 2, nome: 'Nova', andar: 'Térreo' }, ADMIN)).rejects.toThrow(/reaproveitado/);
  });

  it('excluir só é permitido para salas sem nenhuma reserva', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    await expect(excluirSala(s1.id, ADMIN)).rejects.toThrow(/Desativar/);
  });
});

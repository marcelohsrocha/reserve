import { describe, expect, it } from 'vitest';
import { ErroConflito } from '@/services/erros';
import { mapaDisponibilidade } from '@/services/ocupacao';
import { bloquearSala } from '@/services/bloqueios';
import { ADMIN, cenario, reservar, t } from './helpers';

const recorrencia = { dataInicio: '2030-11-04', dataFim: '2030-11-06', horaInicio: '19:00', horaFim: '21:00' };

describe('reserva "quando → onde"', () => {
  it('mostra para cada sala ativa quantas datas estão ocupadas, com uma consulta só', async () => {
    const { s1, s2, s3, ana } = await cenario();
    // S01 ocupada só na terça; S02 bloqueada nos 3 dias; S03 livre.
    await reservar(s1.id, ana.id, '20:00', '22:00', { dataInicio: '2030-11-05', dataFim: '2030-11-05' });
    await bloquearSala(s2.id, { inicio: t('00:00'), fim: t('23:00', '2030-11-06'), motivo: 'Reforma' }, undefined, ADMIN);

    const { pedidos, salas } = await mapaDisponibilidade(recorrencia);
    expect(pedidos).toHaveLength(3);
    const porId = Object.fromEntries(salas.map((s) => [s.sala.id, new Set(s.conflitos.map((c) => c.pedido)).size]));
    expect(porId[s1.id]).toBe(1);
    expect(porId[s2.id]).toBe(3);
    expect(porId[s3.id]).toBe(0);
  });

  it('com "pular conflitos" cria só as datas livres; sem a opção, recusa tudo', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00', { dataInicio: '2030-11-05', dataFim: '2030-11-05' });

    await expect(reservar(s1.id, joao.id, '19:00', '21:00', { dataFim: '2030-11-06' })).rejects.toBeInstanceOf(ErroConflito);

    const r = await reservar(s1.id, joao.id, '19:00', '21:00', { dataFim: '2030-11-06', pularConflitos: true });
    expect(r.ocorrencias.map((o) => o.inicioUtc)).toEqual([t('19:00', '2030-11-04'), t('19:00', '2030-11-06')]);
  });

  it('"pular conflitos" ainda recusa quando nenhuma data está livre', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '18:00', '22:00');
    await expect(reservar(s1.id, joao.id, '19:00', '21:00', { pularConflitos: true })).rejects.toBeInstanceOf(ErroConflito);
  });
});

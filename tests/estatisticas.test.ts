import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { ocupacaoDasSalas, rankingPessoas } from '@/services/estatisticas';
import { ADMIN, cenario, reservar, t } from './helpers';
import { criarPessoa } from '@/services/pessoas';

describe('estatísticas do painel admin', () => {
  it('ordena as salas pelas horas ocupadas', async () => {
    const { s1, s2, ana } = await cenario();
    // Duas segundas-feiras das 8h às 14h = 12 h, com pico "Seg 8h".
    await reservar(s2.id, ana.id, '08:00', '14:00', { dataFim: '2030-11-11', diasSemana: [1] });
    await reservar(s1.id, ana.id, '19:00', '21:00'); // 2 h
    const oc = await ocupacaoDasSalas(t('12:00'));
    expect(oc.map((o) => [o.numero, o.horas])).toEqual([[2, 12], [1, 2], [3, 0]]);
    expect(oc[0].pico).toBe('Seg 8h');
    expect(oc[1].pico).toBeNull(); // um único evento não define pico
    expect(oc[0].percentual).toBe(1); // 12 h de 900 h úteis na janela de 60 dias
  });

  it('ranking de pessoas conta usos e faltas, ignorando canceladas', async () => {
    const { s1, s2, ana, joao } = await cenario();
    const maria = await criarPessoa({ nome: 'Maria', telefone: '(67) 97777-0000' }, ADMIN);
    await reservar(s1.id, ana.id, '08:00', '09:00', { dataFim: '2030-11-06' }); // 3 usos
    const rj = await reservar(s2.id, joao.id, '08:00', '09:00');
    await db.ocorrencia.updateMany({ where: { reservaId: rj.id }, data: { status: 'NAO_COMPARECEU' } });
    const rm = await reservar(s2.id, maria.id, '10:00', '11:00');
    await db.ocorrencia.updateMany({ where: { reservaId: rm.id }, data: { status: 'CANCELADA' } });

    const r = await rankingPessoas(t('23:00', '2030-11-06'));
    expect(r.map((p) => [p.nome, p.usos, p.faltas])).toEqual([
      ['Ana Souza', 3, 0],
      ['João Lima', 0, 1],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { encontrarConflitos } from '@/domain/conflito';
import { agendaFalsa } from '@/integrations/google';
import { ErroConflito } from '@/services/erros';
import { verificarConflitos } from '@/services/ocupacao';
import { desativarSala } from '@/services/salas';
import { bloquearSala } from '@/services/bloqueios';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('detecção de conflito por sala na agenda única', () => {
  it('domínio: só conflita na mesma sala e com sobreposição real', () => {
    const ocup = [{ salaNumero: 1, inicio: t('19:00'), fim: t('21:00'), titulo: 'X', origem: 'reserva' as const }];
    expect(encontrarConflitos(1, [{ inicio: t('20:00'), fim: t('22:00') }], ocup)).toHaveLength(1);
    expect(encontrarConflitos(2, [{ inicio: t('20:00'), fim: t('22:00') }], ocup)).toHaveLength(0);
    // Encostar no horário não é sobrepor.
    expect(encontrarConflitos(1, [{ inicio: t('21:00'), fim: t('22:00') }], ocup)).toHaveLength(0);
    expect(encontrarConflitos(1, [{ inicio: t('18:00'), fim: t('19:00') }], ocup)).toHaveLength(0);
  });

  it('impede duas reservas sobrepostas na mesma sala e informa o conflito', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    const erro = await reservar(s1.id, joao.id, '20:00', '22:00').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroConflito);
    expect((erro as ErroConflito).detalhes).toEqual([expect.stringContaining('04/11/2030 20:00–22:00: conflita com reserva "Ensaio do louvor" (19:00–21:00)')]);
  });

  it('permite reservas no mesmo horário em salas DIFERENTES', async () => {
    const { s1, s2, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    await expect(reservar(s2.id, joao.id, '19:00', '21:00')).resolves.toBeTruthy();
  });

  it('cria no Google um evento por ocorrência com prefixo, location, cor e propriedades', async () => {
    const { s2, ana } = await cenario();
    const r = await reservar(s2.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-06' });
    const eventos = [...agendaFalsa().eventos.values()];
    expect(eventos).toHaveLength(3);
    expect(eventos[0]).toMatchObject({
      titulo: '[S02] Ensaio do louvor',
      location: 'S02 – Sala dos Jovens (1º andar)',
      colorId: '8',
      privado: { salaNumero: '2', reservaId: r.id, tipo: 'reserva' },
    });
    expect(eventos[0].descricao).toContain('(67) 9****-1234');
    expect(eventos[0].descricao).not.toContain('99999-1234');
  });

  it('eventos criados fora do sistema não bloqueiam nenhuma sala, nem com [Snn] ou salaNumero', async () => {
    const { s1, s2, ana } = await cenario();
    agendaFalsa().criarManual('[s2] Reunião de diáconos', t('19:30'), t('20:30'));
    agendaFalsa().criarManual('Culto sem prefixo', t('19:30'), t('20:30'), { salaNumero: '1' });
    expect(await verificarConflitos(2, [{ inicio: t('19:00'), fim: t('21:00') }])).toHaveLength(0);
    await expect(reservar(s1.id, ana.id, '19:00', '21:00')).resolves.toBeTruthy();
    await expect(reservar(s2.id, ana.id, '19:00', '21:00')).resolves.toBeTruthy();
  });

  it('confere ao vivo no Google: evento do sistema ainda não sincronizado também bloqueia', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    // Simula o banco local sem a ocorrência ativa enquanto o Google ainda tem o evento.
    const [oc] = r.ocorrencias;
    agendaFalsa().criarManual('[S01] Cópia', t('19:00'), t('21:00'), { salaNumero: '1', ocorrenciaId: 'outra-ocorrencia' });
    expect(await verificarConflitos(1, [{ inicio: t('20:00'), fim: t('22:00') }], { ocorrenciaIds: new Set([oc.id]) })).toHaveLength(1);
  });

  it('eventos de sala desativada não bloqueiam', async () => {
    const { s3 } = await cenario();
    await desativarSala(s3.id, undefined, ADMIN, t('08:00'));
    agendaFalsa().criarManual('[S03] Antiga', t('19:00'), t('21:00'), { salaNumero: '3', bloqueioId: 'x' });
    expect(await verificarConflitos(3, [{ inicio: t('19:00'), fim: t('21:00') }])).toHaveLength(0);
  });

  it('bloqueia contra um bloqueio por período', async () => {
    const { s1, ana } = await cenario();
    await bloquearSala(s1.id, { inicio: t('18:00'), fim: t('23:00'), motivo: 'Dedetização' }, undefined, ADMIN, t('08:00'));
    const erro = await reservar(s1.id, ana.id, '19:00', '21:00').catch((e) => e);
    expect(erro).toBeInstanceOf(ErroConflito);
    expect(String((erro as ErroConflito).detalhes)).toContain('bloqueio');
  });

  it('em reserva de vários dias, aponta exatamente as datas em conflito', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00', { dataInicio: '2030-11-06', dataFim: '2030-11-06' });
    const erro = (await reservar(s1.id, joao.id, '19:00', '20:00', { dataFim: '2030-11-08' }).catch((e) => e)) as ErroConflito;
    expect(erro.conflitos).toHaveLength(1);
    expect(erro.detalhes).toEqual([expect.stringMatching(/^06\/11\/2030 19:00–20:00/)]);
  });
});

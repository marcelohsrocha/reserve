import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { bloquearSala, removerBloqueio } from '@/services/bloqueios';
import { obterPainel } from '@/services/painel';
import { ErroConflito } from '@/services/erros';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('bloqueio por período', () => {
  it('cria o evento [Snn] BLOQUEADA no Google, impede reservas e aparece como bloqueada no painel', async () => {
    const { s3, ana } = await cenario();
    const { bloqueio } = await bloquearSala(
      s3.id,
      { inicio: t('00:00', '2030-11-10'), fim: t('23:59', '2030-11-20'), motivo: 'Reforma' },
      undefined,
      ADMIN,
      t('08:00'),
    );
    const ev = agendaFalsa().eventos.get(bloqueio.googleEventId!)!;
    expect(ev.titulo).toBe('[S03] BLOQUEADA – Reforma');
    expect(ev.privado).toMatchObject({ salaNumero: '3', tipo: 'bloqueio', bloqueioId: bloqueio.id });

    await expect(reservar(s3.id, ana.id, '19:00', '21:00', { dataInicio: '2030-11-15', dataFim: '2030-11-15' })).rejects.toThrow(ErroConflito);
    await expect(reservar(s3.id, ana.id, '19:00', '21:00', { dataInicio: '2030-11-21', dataFim: '2030-11-21' })).resolves.toBeTruthy();

    const card = (await obterPainel(t('10:00', '2030-11-12'))).andares.flatMap((a) => a.salas).find((s) => s.id === s3.id)!;
    expect(card.estado).toBe('BLOQUEADA');
    expect(card.atual?.titulo).toBe('Reforma');
    // Termina automaticamente.
    const depois = (await obterPainel(t('10:00', '2030-11-21'))).andares.flatMap((a) => a.salas).find((s) => s.id === s3.id)!;
    expect(depois.estado).not.toBe('BLOQUEADA');
  });

  it('com reservas no período exige transferir ou cancelar', async () => {
    const { s1, s2, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    const periodo = { inicio: t('18:00'), fim: t('23:00'), motivo: 'Dedetização' };
    await expect(bloquearSala(s1.id, periodo, undefined, ADMIN, t('08:00'))).rejects.toThrow(/Escolha transferir/);
    const res = await bloquearSala(s1.id, periodo, { acao: 'transferir', destinoId: s2.id }, ADMIN, t('08:00'));
    expect(res.transferidas).toBe(1);
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).salaId).toBe(s2.id);
  });

  it('remover o bloqueio libera a sala e apaga o evento no Google', async () => {
    const { s1, ana } = await cenario();
    const { bloqueio } = await bloquearSala(s1.id, { inicio: t('18:00'), fim: t('23:00'), motivo: 'Evento' }, undefined, ADMIN, t('08:00'));
    await removerBloqueio(bloqueio.id, ADMIN);
    expect(agendaFalsa().eventos.get(bloqueio.googleEventId!)?.cancelado).toBe(true);
    await expect(reservar(s1.id, ana.id, '19:00', '21:00')).resolves.toBeTruthy();
  });
});

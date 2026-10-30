import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { confirmarCheckin, situacaoCheckin } from '@/services/checkin';
import { desativarSala, regenerarQr, reativarSala } from '@/services/salas';
import { bloquearSala } from '@/services/bloqueios';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('check-in por QR Code', () => {
  it('mostra a reserva vigente até 15 minutos antes do início', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    expect((await situacaoCheckin(s1.qrToken, t('18:44'))).tipo).toBe('LIVRE');
    const sit = await situacaoCheckin(s1.qrToken, t('18:45'));
    expect(sit.tipo).toBe('RESERVA');
    if (sit.tipo === 'RESERVA') expect(sit.telefoneMascarado).toBe('(67) 9****-1234');
  });

  it('telefone errado não confirma; correto confirma e registra o horário', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    expect(await confirmarCheckin(s1.qrToken, '0000', '1.1.1.1', t('19:05'))).toEqual({ ok: false, motivo: 'DIGITOS' });
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).status).toBe('AGENDADA');

    expect(await confirmarCheckin(s1.qrToken, '1234', '1.1.1.1', t('19:05'))).toMatchObject({ ok: true });
    const oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(oc.status).toBe('CONFIRMADA');
    expect(oc.checkinEm?.toISOString()).toBe(t('19:05').toISOString());
    expect(await confirmarCheckin(s1.qrToken, '1234', '1.1.1.1', t('19:06'))).toEqual({ ok: false, motivo: 'JA_CONFIRMADA' });
  });

  it('limita a 5 tentativas por IP a cada 10 minutos', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    for (let i = 0; i < 5; i++) await confirmarCheckin(s1.qrToken, '9999', '2.2.2.2', t('19:01'));
    expect(await confirmarCheckin(s1.qrToken, '1234', '2.2.2.2', t('19:02'))).toEqual({ ok: false, motivo: 'LIMITE' });
    expect(await confirmarCheckin(s1.qrToken, '1234', '3.3.3.3', t('19:02'))).toMatchObject({ ok: true });
    // Passada a janela, o IP volta a poder tentar.
    expect((await confirmarCheckin(s1.qrToken, '0000', '2.2.2.2', t('19:12'))).ok).toBe(false);
  });

  it('sala desativada ou QR regenerado mostram "Sala indisponível"', async () => {
    const { s1, s2 } = await cenario();
    const antigo = s2.qrToken;
    const nova = await regenerarQr(s2.id, ADMIN);
    expect((await situacaoCheckin(antigo, t('10:00'))).tipo).toBe('INDISPONIVEL');
    expect((await situacaoCheckin(nova.qrToken, t('10:00'))).tipo).toBe('LIVRE');

    await desativarSala(s1.id, undefined, ADMIN, t('08:00'));
    expect((await situacaoCheckin(s1.qrToken, t('10:00'))).tipo).toBe('INDISPONIVEL');
    // Reativar gera QR novo; o antigo continua inválido.
    const reativada = await reativarSala(s1.id, ADMIN);
    expect(reativada.qrToken).not.toBe(s1.qrToken);
    expect((await situacaoCheckin(s1.qrToken, t('10:00'))).tipo).toBe('INDISPONIVEL');
    expect((await situacaoCheckin(reativada.qrToken, t('10:00'))).tipo).toBe('LIVRE');
  });

  it('sala bloqueada mostra o motivo', async () => {
    const { s1 } = await cenario();
    await bloquearSala(s1.id, { inicio: t('09:00'), fim: t('12:00'), motivo: 'Reforma' }, undefined, ADMIN, t('08:00'));
    expect(await situacaoCheckin(s1.qrToken, t('10:00'))).toMatchObject({ tipo: 'BLOQUEADA', motivo: 'Reforma' });
  });
});

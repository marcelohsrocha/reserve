import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { confirmarCheckin, encerrarPelaPorta, situacaoCheckin } from '@/services/checkin';
import { agendaFalsa } from '@/integrations/google';
import { criarPessoa } from '@/services/pessoas';
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
    expect(await confirmarCheckin(s1.qrToken, { digitos: '0000', ip: '1.1.1.1' }, t('19:05'))).toEqual({ ok: false, motivo: 'DIGITOS' });
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).status).toBe('AGENDADA');

    expect(await confirmarCheckin(s1.qrToken, { digitos: '1234', ip: '1.1.1.1' }, t('19:05'))).toMatchObject({ ok: true });
    const oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(oc.status).toBe('CONFIRMADA');
    expect(oc.checkinEm?.toISOString()).toBe(t('19:05').toISOString());
    expect(await confirmarCheckin(s1.qrToken, { digitos: '1234', ip: '1.1.1.1' }, t('19:06'))).toEqual({ ok: false, motivo: 'JA_CONFIRMADA' });
  });

  it('limita a 5 tentativas por IP a cada 10 minutos', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    for (let i = 0; i < 5; i++) await confirmarCheckin(s1.qrToken, { digitos: '9999', ip: '2.2.2.2' }, t('19:01'));
    expect(await confirmarCheckin(s1.qrToken, { digitos: '1234', ip: '2.2.2.2' }, t('19:02'))).toEqual({ ok: false, motivo: 'LIMITE' });
    expect(await confirmarCheckin(s1.qrToken, { digitos: '1234', ip: '3.3.3.3' }, t('19:02'))).toMatchObject({ ok: true });
    // Passada a janela, o IP volta a poder tentar.
    expect((await confirmarCheckin(s1.qrToken, { digitos: '0000', ip: '2.2.2.2' }, t('19:12'))).ok).toBe(false);
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

  it('1 toque: o responsável ou um admin logado confirmam sem digitar; outra pessoa não', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    expect(await confirmarCheckin(s1.qrToken, { pessoaId: joao.id }, t('19:01'))).toEqual({ ok: false, motivo: 'SEM_PERMISSAO' });
    expect(await confirmarCheckin(s1.qrToken, { pessoaId: ana.id }, t('19:02'))).toMatchObject({ ok: true });

    const r2 = await reservar(s1.id, ana.id, '21:00', '22:00');
    const admin = await criarPessoa({ nome: 'Secretaria', email: 'sec@ipi.org', papel: 'ADMIN' }, ADMIN);
    expect(await confirmarCheckin(s1.qrToken, { pessoaId: admin.id }, t('21:01'))).toMatchObject({ ok: true });
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r2.id } })).status).toBe('CONFIRMADA');
  });

  it('"Encerrar agora" libera a sala na hora e encurta o evento no Google', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    // Antes do início não dá para encerrar.
    expect(await encerrarPelaPorta(s1.qrToken, { pessoaId: ana.id }, t('18:50'))).toEqual({ ok: false, motivo: 'NAO_COMECOU' });
    // Dígitos errados não encerram.
    expect(await encerrarPelaPorta(s1.qrToken, { digitos: '0000', ip: '5.5.5.5' }, t('20:00'))).toEqual({ ok: false, motivo: 'DIGITOS' });

    expect(await encerrarPelaPorta(s1.qrToken, { digitos: '1234', ip: '5.5.5.5' }, t('20:10'))).toMatchObject({ ok: true });
    const o = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(o).toMatchObject({ status: 'FINALIZADA', fimUtc: t('20:10') });
    expect(agendaFalsa().eventos.get(o.googleEventId!)!.fim).toEqual(t('20:10'));
    expect((await situacaoCheckin(s1.qrToken, t('20:11'))).tipo).toBe('LIVRE');
  });
});

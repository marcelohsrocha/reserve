import { describe, expect, it } from 'vitest';
import { proximoStatus } from '@/domain/status';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { atualizarStatus } from '@/services/status';
import { obterPainel } from '@/services/painel';
import { liberarOcorrencia } from '@/services/reservas';
import { ADMIN, cenario, reservar, t } from './helpers';

const regras = { toleranciaCheckinMin: 20, liberacaoAutomatica: true };

describe('regras automáticas de status', () => {
  const o = { status: 'AGENDADA', inicioUtc: t('19:00'), fimUtc: t('21:00'), checkinEm: null };

  it('domínio: transições pelo relógio', () => {
    expect(proximoStatus(o, t('18:59'), regras)).toBeNull();
    expect(proximoStatus(o, t('19:00'), regras)).toBe('EM_ANDAMENTO');
    expect(proximoStatus({ ...o, status: 'EM_ANDAMENTO' }, t('19:19'), regras)).toBeNull();
    expect(proximoStatus({ ...o, status: 'EM_ANDAMENTO' }, t('19:20'), regras)).toBe('NAO_COMPARECEU');
    expect(proximoStatus({ ...o, status: 'EM_ANDAMENTO' }, t('19:20'), { ...regras, liberacaoAutomatica: false })).toBeNull();
    expect(proximoStatus({ ...o, status: 'CONFIRMADA', checkinEm: t('19:05') }, t('20:59'), regras)).toBeNull();
    expect(proximoStatus({ ...o, status: 'CONFIRMADA', checkinEm: t('19:05') }, t('21:00'), regras)).toBe('FINALIZADA');
    expect(proximoStatus({ ...o, status: 'CANCELADA' }, t('21:00'), regras)).toBeNull();
  });

  it('no horário final a ocorrência vira FINALIZADA e a sala aparece LIVRE', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await db.ocorrencia.updateMany({ where: { reservaId: r.id }, data: { status: 'CONFIRMADA', checkinEm: t('19:02') } });

    let painel = await obterPainel(t('20:59'));
    expect(painel.andares.flatMap((a) => a.salas).find((s) => s.id === s1.id)?.estado).toBe('OCUPADA');

    await atualizarStatus(t('21:00'));
    const oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(oc.status).toBe('FINALIZADA');
    painel = await obterPainel(t('21:00'));
    expect(painel.andares.flatMap((a) => a.salas).find((s) => s.id === s1.id)?.estado).toBe('LIVRE');
  });

  it('no início vira EM_ANDAMENTO (amarelo) e, sem check-in, NAO_COMPARECEU encurtando o evento', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await atualizarStatus(t('19:00'));
    let oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(oc.status).toBe('EM_ANDAMENTO');
    expect((await obterPainel(t('19:01'))).andares[0].salas[0].estado).toBe('RESERVADA');

    await atualizarStatus(t('19:20'));
    oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    expect(oc.status).toBe('NAO_COMPARECEU');
    expect(agendaFalsa().eventos.get(oc.googleEventId!)?.fim.toISOString()).toBe(t('19:20').toISOString());
    expect((await obterPainel(t('19:21'))).andares[0].salas[0].estado).toBe('LIVRE');
  });

  it('com a liberação automática desligada a sala continua reservada', async () => {
    const { s1, ana } = await cenario();
    await db.configuracao.upsert({ where: { id: 1 }, update: { liberacaoAutomatica: false }, create: { id: 1, liberacaoAutomatica: false } });
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await atualizarStatus(t('19:00'));
    await atualizarStatus(t('19:40'));
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).status).toBe('EM_ANDAMENTO');
  });

  it('sem check-in em 15 minutos (padrão) a sala volta a ficar disponível para nova reserva', async () => {
    const { s1, ana, joao } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await atualizarStatus(t('19:00'));
    await atualizarStatus(t('19:14'));
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).status).toBe('EM_ANDAMENTO');
    await atualizarStatus(t('19:15'));
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).status).toBe('NAO_COMPARECEU');
    // Outra pessoa já pode reservar o restante do horário.
    const { criarReserva } = await import('@/services/reservas');
    await expect(
      criarReserva({ salaId: s1.id, pessoaId: joao.id, titulo: 'Reunião', dataInicio: '2030-11-04', dataFim: '2030-11-04', horaInicio: '19:30', horaFim: '20:30' }, ADMIN, t('19:16')),
    ).resolves.toBeTruthy();
  });

  it('liberar sala antes do término finaliza agora e encurta o evento no Google', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    const oc = r.ocorrencias[0];
    await expect(liberarOcorrencia(oc.id, ADMIN, t('18:30'))).rejects.toThrow(/acontecendo agora/);
    await liberarOcorrencia(oc.id, ADMIN, t('20:10'));
    const depois = await db.ocorrencia.findUniqueOrThrow({ where: { id: oc.id } });
    expect(depois.status).toBe('FINALIZADA');
    expect(depois.fimUtc.toISOString()).toBe(t('20:10').toISOString());
    expect(agendaFalsa().eventos.get(oc.googleEventId!)?.fim.toISOString()).toBe(t('20:10').toISOString());
    expect((await obterPainel(t('20:11'))).andares[0].salas[0].estado).toBe('LIVRE');
  });
});

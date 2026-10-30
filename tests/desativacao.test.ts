import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { desativarSala } from '@/services/salas';
import { obterPainel } from '@/services/painel';
import { sincronizar } from '@/services/sincronizacao';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('desativação de sala', () => {
  it('não permite desativar com reservas futuras sem escolher transferir ou cancelar', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');
    await expect(desativarSala(s1.id, undefined, ADMIN, t('08:00'))).rejects.toThrow(/Escolha transferir/);
    expect((await db.sala.findUniqueOrThrow({ where: { id: s1.id } })).ativa).toBe(true);
  });

  it('transfere todas para outra sala, atualizando prefixo, location, cor e salaNumero no Google', async () => {
    const { s1, s2, ana } = await cenario();
    await db.corAndar.create({ data: { andar: '1º andar', colorId: '5' } });
    const r = await reservar(s1.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-05' });
    const res = await desativarSala(s1.id, { acao: 'transferir', destinoId: s2.id }, ADMIN, t('08:00'));
    expect(res).toEqual({ transferidas: 2, canceladas: 0 });

    const ocs = await db.ocorrencia.findMany({ where: { reservaId: r.id } });
    expect(ocs.every((o) => o.salaId === s2.id && o.status === 'AGENDADA')).toBe(true);
    expect((await db.reserva.findUniqueOrThrow({ where: { id: r.id } })).salaId).toBe(s2.id);
    const ev = agendaFalsa().eventos.get(ocs[0].googleEventId!)!;
    expect(ev).toMatchObject({ titulo: '[S02] Ensaio do louvor', location: 'S02 – Sala dos Jovens (1º andar)', colorId: '5' });
    expect(ev.privado.salaNumero).toBe('2');

    const sala = await db.sala.findUniqueOrThrow({ where: { id: s1.id } });
    expect(sala.ativa).toBe(false);
    // Some dos painéis, mas continua no histórico.
    const painel = await obterPainel(t('08:00'));
    expect(painel.andares.flatMap((a) => a.salas).map((s) => s.id)).not.toContain(s1.id);
    expect(await db.auditoria.count({ where: { entidade: 'sala', entidadeId: s1.id, acao: 'desativar' } })).toBe(1);
  });

  it('lista as ocorrências que não cabem no destino e só conclui se autorizado a cancelá-las', async () => {
    const { s1, s2, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-06' }); // 04, 05, 06
    await reservar(s2.id, joao.id, '20:00', '22:00', { dataInicio: '2030-11-05', dataFim: '2030-11-05' });

    const erro = await desativarSala(s1.id, { acao: 'transferir', destinoId: s2.id }, ADMIN, t('08:00')).catch((e) => e);
    expect(erro.message).toMatch(/1 ocorrência\(s\) não cabem na S02/);
    expect(erro.detalhes).toEqual([expect.stringMatching(/^05\/11\/2030 19:00–21:00/)]);
    expect((await db.sala.findUniqueOrThrow({ where: { id: s1.id } })).ativa).toBe(true);

    const res = await desativarSala(s1.id, { acao: 'transferir', destinoId: s2.id, cancelarRestantes: true }, ADMIN, t('08:00'));
    expect(res).toEqual({ transferidas: 2, canceladas: 1 });
  });

  it('cancela todas, removendo os eventos do Google', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-05' });
    const res = await desativarSala(s1.id, { acao: 'cancelar' }, ADMIN, t('08:00'));
    expect(res).toEqual({ transferidas: 0, canceladas: 2 });
    const ocs = await db.ocorrencia.findMany({ where: { reservaId: r.id } });
    expect(ocs.every((o) => o.status === 'CANCELADA')).toBe(true);
    expect(ocs.every((o) => agendaFalsa().eventos.get(o.googleEventId!)?.cancelado)).toBe(true);
  });
});

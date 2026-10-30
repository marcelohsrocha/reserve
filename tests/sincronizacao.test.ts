import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { sincronizar, vincularEvento } from '@/services/sincronizacao';
import { obterPainel } from '@/services/painel';
import { cancelarOcorrencias } from '@/services/reservas';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('sincronização reversa com o Google', () => {
  it('evento manual com [S2] é vinculado à sala 2, ganha salaNumero e título padronizado', async () => {
    const { s2 } = await cenario();
    const id = agendaFalsa().criarManual('[S2] Reunião de diáconos', t('19:00'), t('20:00'));
    await sincronizar();
    const ev = agendaFalsa().eventos.get(id)!;
    expect(ev.titulo).toBe('[S02] Reunião de diáconos');
    expect(ev.privado.salaNumero).toBe('2');
    expect(ev.location).toBe('S02 – Sala dos Jovens (1º andar)');
    expect((await db.eventoGoogle.findUniqueOrThrow({ where: { googleEventId: id } })).estado).toBe('VINCULADO');

    const card = (await obterPainel(t('19:10'))).andares.flatMap((a) => a.salas).find((s) => s.id === s2.id)!;
    expect(card.estado).toBe('OCUPADA');
    // O próprio patch volta no próximo sync sem gerar novo patch (sem loop).
    const patches = agendaFalsa().chamadas.filter((c) => c === 'patch').length;
    await sincronizar();
    expect(agendaFalsa().chamadas.filter((c) => c === 'patch').length).toBe(patches);
  });

  it('evento sem prefixo vai para a fila e pode ser vinculado com 1 clique', async () => {
    const { s1, s2, ana } = await cenario();
    const id = agendaFalsa().criarManual('Ensaio de casamento', t('15:00'), t('16:00'));
    await sincronizar();
    expect((await db.eventoGoogle.findUniqueOrThrow({ where: { googleEventId: id } })).estado).toBe('NAO_IDENTIFICADO');
    // Não bloqueia nenhuma sala enquanto não for vinculado.
    await expect(reservar(s1.id, ana.id, '15:00', '16:00')).resolves.toBeTruthy();

    await vincularEvento(id, s2.id, ADMIN);
    expect(agendaFalsa().eventos.get(id)!.titulo).toBe('[S02] Ensaio de casamento');
    await expect(reservar(s2.id, ana.id, '15:30', '16:30')).rejects.toThrow();
  });

  it('evento do sistema apagado direto no Google cancela a ocorrência', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await sincronizar();
    const oc = await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } });
    await agendaFalsa().remover(oc.googleEventId!);
    await sincronizar();
    expect((await db.ocorrencia.findUniqueOrThrow({ where: { id: oc.id } })).status).toBe('CANCELADA');
  });

  it('ocorrência cancelada no sistema libera a sala imediatamente', async () => {
    const { s1, ana, joao } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await cancelarOcorrencias(r.ocorrencias.map((o) => o.id), ADMIN);
    await expect(reservar(s1.id, joao.id, '19:00', '21:00')).resolves.toBeTruthy();
  });
});

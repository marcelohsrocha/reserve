import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa } from '@/integrations/google';
import { sincronizar } from '@/services/sincronizacao';
import { obterPainel } from '@/services/painel';
import { cancelarOcorrencias } from '@/services/reservas';
import { ADMIN, cenario, reservar, t } from './helpers';

describe('sincronização reversa com o Google', () => {
  it('evento criado direto no Google (sem identificação) é apagado e fica na auditoria', async () => {
    const { s2, ana } = await cenario();
    const comPrefixo = agendaFalsa().criarManual('[S2] Reunião de diáconos', t('19:00'), t('20:00'));
    const semPrefixo = agendaFalsa().criarManual('Ensaio de casamento', t('15:00'), t('16:00'));
    await sincronizar();
    for (const id of [comPrefixo, semPrefixo]) {
      expect(agendaFalsa().eventos.get(id)!.cancelado).toBe(true);
      expect((await db.eventoGoogle.findUniqueOrThrow({ where: { googleEventId: id } })).estado).toBe('REMOVIDO');
    }
    const aud = await db.auditoria.findMany({ where: { acao: 'remover_evento_sem_identificacao' } });
    expect(aud.map((a) => a.entidadeId).sort()).toEqual([comPrefixo, semPrefixo].sort());
    expect(JSON.parse(aud.find((a) => a.entidadeId === semPrefixo)!.detalhes!).titulo).toBe('Ensaio de casamento');

    // O eco da remoção no próximo sync não vira "cancelado" nem gera nova auditoria.
    await sincronizar();
    expect((await db.eventoGoogle.findUniqueOrThrow({ where: { googleEventId: comPrefixo } })).estado).toBe('REMOVIDO');
    expect(await db.auditoria.count({ where: { acao: 'remover_evento_sem_identificacao' } })).toBe(2);

    // A sala continua livre.
    await expect(reservar(s2.id, ana.id, '19:00', '20:00')).resolves.toBeTruthy();
    const card = (await obterPainel(t('19:10'))).andares.flatMap((a) => a.salas).find((s) => s.id === s2.id)!;
    expect(card.atual?.titulo).toBe('Ensaio do louvor');
  });

  it('eventos do próprio sistema são mantidos e eventos externos já encerrados ficam como histórico', async () => {
    const { s1, ana } = await cenario();
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    const antigo = agendaFalsa().criarManual('Culto de 2020', new Date('2020-01-05T22:00:00Z'), new Date('2020-01-05T23:00:00Z'));
    await sincronizar();
    expect(agendaFalsa().eventos.get(r.ocorrencias[0].googleEventId!)!.cancelado).toBe(false);
    expect(agendaFalsa().eventos.get(antigo)!.cancelado).toBe(false);
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

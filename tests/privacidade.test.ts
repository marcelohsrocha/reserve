import { describe, expect, it } from 'vitest';
import { obterPainel } from '@/services/painel';
import { mapaDisponibilidade } from '@/services/ocupacao';
import { descreverConflito } from '@/services/erros';
import { paraVisao, TITULO_OCULTO } from '@/domain/privacidade';
import { cenario, reservar, t } from './helpers';

const cardDe = async (salaId: string, agora: Date, visao: { id: string | null; admin: boolean }) =>
  (await obterPainel(agora, visao)).andares.flatMap((a) => a.salas).find((s) => s.id === salaId)!;

describe('privacidade entre membros', () => {
  it('no painel, membro vê só "Reservado" e o horário das reservas dos outros', async () => {
    const { s1, ana, joao } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00');

    const deJoao = await cardDe(s1.id, t('19:30'), { id: joao.id, admin: false });
    expect(deJoao.atual).toMatchObject({ titulo: TITULO_OCULTO, responsavel: null });
    expect(deJoao.atual!.inicio).toBe(t('19:00').toISOString());

    const daAna = await cardDe(s1.id, t('19:30'), { id: ana.id, admin: false });
    expect(daAna.atual!.titulo).not.toBe(TITULO_OCULTO);
    expect(daAna.atual!.responsavel).toBe(ana.nome);

    const doAdmin = await cardDe(s1.id, t('19:30'), { id: 'x', admin: true });
    expect(doAdmin.atual!.responsavel).toBe(ana.nome);

    const anonimo = await cardDe(s1.id, t('18:00'), { id: null, admin: false });
    expect(anonimo.proximo).toMatchObject({ titulo: TITULO_OCULTO, responsavel: null });
  });

  it('o conflito mostrado ao membro não traz o título da reserva de outra pessoa', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00', { titulo: 'Reunião sigilosa' });
    const { salas } = await mapaDisponibilidade({ dataInicio: '2030-11-04', dataFim: '2030-11-04', horaInicio: '20:00', horaFim: '22:00' });
    const c = salas.find((s) => s.sala.id === s1.id)!.conflitos[0]!;
    expect(descreverConflito(c, false)).not.toContain(c.com.titulo);
    expect(descreverConflito(c, false)).toContain('19:00 às 21:00');
    expect(descreverConflito(c, true)).toContain(c.com.titulo);
  });

  it('bloqueios (reforma etc.) continuam visíveis: não são dado pessoal', () => {
    const b = { tipo: 'bloqueio', titulo: 'Bloqueada – Reforma', pessoaId: null };
    expect(paraVisao(b, { id: 'm', admin: false }).titulo).toBe('Bloqueada – Reforma');
  });
});

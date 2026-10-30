import { describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { agendaFalsa, agendasPessoaisFalsas } from '@/integrations/google';
import { cancelarOcorrencias, editarReserva, liberarOcorrencia, remarcarOcorrencia, transferirOcorrencias } from '@/services/reservas';
import { atualizarStatus } from '@/services/status';
import { entrarComGoogle } from '@/services/pessoas';
import { ADMIN, DIA, cenario, reservar, t } from './helpers';

/** Simula o login com a agenda autorizada (guarda o refresh token cifrado). */
async function conectar(email: string) {
  return (await entrarComGoogle({ email, nome: email, refreshToken: `token-${email}`, agendaAutorizada: true })).pessoa;
}
const agendaDe = (pessoaId: string) => agendasPessoaisFalsas().get(pessoaId);
const copiasAtivas = (pessoaId: string) => [...(agendaDe(pessoaId)?.eventos.values() ?? [])].filter((e) => !e.cancelado);

describe('cópia da reserva na agenda Google pessoal do responsável', () => {
  it('reservar grava o evento nas duas agendas: a do sistema e a do usuário', async () => {
    const { s2, ana } = await cenario();
    await conectar('ana@gmail.com');
    const r = await reservar(s2.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-05' });

    expect(agendaFalsa().eventos.size).toBe(2);
    const copias = copiasAtivas(ana.id);
    expect(copias).toHaveLength(2);
    expect(copias[0]).toMatchObject({ titulo: '[S02] Ensaio do louvor', location: 'S02 – Sala dos Jovens (1º andar) – IPI Dourados' });
    expect(copias[0].privado.tipo).toBe('copia-reserva');
    // A cópia não leva telefone e não tem salaNumero (não é lida pela sincronização).
    expect(copias[0].descricao).not.toMatch(/\d{4}/);
    expect(copias[0].privado.salaNumero).toBeUndefined();
    const ocs = await db.ocorrencia.findMany({ where: { reservaId: r.id } });
    expect(ocs.every((o) => o.googleEventIdPessoal && o.pessoaAgendaId === ana.id)).toBe(true);
  });

  it('sem agenda conectada a reserva funciona normalmente (só na agenda do sistema)', async () => {
    const { s1, joao } = await cenario();
    const r = await reservar(s1.id, joao.id, '19:00', '21:00');
    expect(r.ocorrencias[0].googleEventId).toBeTruthy();
    expect(r.ocorrencias[0].googleEventIdPessoal).toBeNull();
    expect(agendaDe(joao.id)).toBeUndefined();
  });

  it('cancelar, remarcar, transferir e liberar mantêm a cópia em dia', async () => {
    const { s1, s2, ana } = await cenario();
    await conectar('ana@gmail.com');
    const r = await reservar(s1.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-06' });
    const [o1, o2, o3] = r.ocorrencias;

    await cancelarOcorrencias([o1.id], ADMIN);
    expect(agendaDe(ana.id)!.eventos.get(o1.googleEventIdPessoal!)!.cancelado).toBe(true);

    await remarcarOcorrencia(o2.id, { data: '2030-11-05', horaInicio: '18:00', horaFim: '19:00' }, ADMIN, t('08:00'));
    expect(agendaDe(ana.id)!.eventos.get(o2.googleEventIdPessoal!)!.inicio).toEqual(t('18:00', '2030-11-05'));

    await transferirOcorrencias([o3.id], s2.id, ADMIN);
    expect(agendaDe(ana.id)!.eventos.get(o3.googleEventIdPessoal!)!.titulo).toBe('[S02] Ensaio do louvor');

    const agora = t('19:30', '2030-11-06');
    await liberarOcorrencia(o3.id, ADMIN, agora);
    expect(agendaDe(ana.id)!.eventos.get(o3.googleEventIdPessoal!)!.fim).toEqual(agora);
  });

  it('trocar o responsável move a cópia de uma agenda para a outra', async () => {
    const { s1, ana, joao } = await cenario();
    await conectar('ana@gmail.com');
    await conectar('joao@gmail.com');
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await editarReserva(r.id, { pessoaId: joao.id }, ADMIN, t('08:00'));
    expect(copiasAtivas(ana.id)).toHaveLength(0);
    expect(copiasAtivas(joao.id)).toHaveLength(1);
    expect((await db.ocorrencia.findFirstOrThrow({ where: { reservaId: r.id } })).pessoaAgendaId).toBe(joao.id);
  });

  it('sem check-in a reserva cai e a cópia sai da agenda pessoal', async () => {
    const { s1, ana } = await cenario();
    await conectar('ana@gmail.com');
    await reservar(s1.id, ana.id, '19:00', '21:00');
    await atualizarStatus(t('19:16'));
    expect(copiasAtivas(ana.id)).toHaveLength(0);
  });

  it('ao conectar a agenda depois, as reservas futuras feitas por um admin são copiadas', async () => {
    const { s1, ana } = await cenario();
    await reservar(s1.id, ana.id, '19:00', '21:00', { dataFim: '2030-11-05' });
    const { copiarReservasFuturas } = await import('@/services/agenda-pessoal');
    await conectar('ana@gmail.com');
    await copiarReservasFuturas(ana.id, t('08:00'));
    expect(copiasAtivas(ana.id)).toHaveLength(2);
  });

  it('se o usuário apagou a cópia da agenda dele, o sistema não recria', async () => {
    const { s1, ana } = await cenario();
    await conectar('ana@gmail.com');
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    await agendaDe(ana.id)!.remover(r.ocorrencias[0].googleEventIdPessoal!);
    await remarcarOcorrencia(r.ocorrencias[0].id, { data: DIA, horaInicio: '18:00', horaFim: '19:00' }, ADMIN, t('08:00'));
    expect(copiasAtivas(ana.id)).toHaveLength(0);
    expect((await db.ocorrencia.findUniqueOrThrow({ where: { id: r.ocorrencias[0].id } })).googleEventIdPessoal).toBeNull();
  });

  it('acesso revogado no Google desconecta a agenda sem afetar a reserva', async () => {
    const { s1, ana } = await cenario();
    await conectar('ana@gmail.com');
    await reservar(s1.id, ana.id, '08:00', '09:00'); // cria a agenda falsa
    const falsa = agendaDe(ana.id)!;
    falsa.criar = async () => {
      throw new Error('invalid_grant: Token has been expired or revoked.');
    };
    const r = await reservar(s1.id, ana.id, '19:00', '21:00');
    expect(r.ocorrencias[0].googleEventId).toBeTruthy();
    const p = await db.pessoa.findUniqueOrThrow({ where: { id: ana.id } });
    expect(p.googleRefreshToken).toBeNull();
    expect(await db.auditoria.count({ where: { acao: 'desconectar_agenda', entidadeId: ana.id } })).toBe(1);
  });
});

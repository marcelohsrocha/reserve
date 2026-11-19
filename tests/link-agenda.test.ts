import { describe, expect, it } from 'vitest';
import { carimboUtc, gerarIcs, linkGoogleAgenda } from '@/domain/link-agenda';
import { t } from './helpers';

const ev = (uid: string, ini: string, fim: string) => ({
  uid,
  titulo: '[S03] Ensaio do louvor, quinta',
  inicio: t(ini),
  fim: t(fim),
  local: 'S03 – Sala de Música (1º andar) – IPI Dourados',
  detalhes: 'Linha 1\nLinha 2; com vírgula, e ponto-e-vírgula',
});

describe('adicionar à minha agenda', () => {
  it('link do Google Agenda leva título, horário em UTC e local', () => {
    const url = new URL(linkGoogleAgenda(ev('a', '19:00', '21:00')));
    expect(url.hostname).toBe('calendar.google.com');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('text')).toBe('[S03] Ensaio do louvor, quinta');
    // 19h em Campo Grande (UTC-4) = 23h UTC
    expect(url.searchParams.get('dates')).toBe('20301104T230000Z/20301105T010000Z');
    expect(url.searchParams.get('location')).toContain('S03');
  });

  it('.ics tem um VEVENT por ocorrência, com escapes e linhas de até 75 bytes', () => {
    const ics = gerarIcs([ev('o1', '19:00', '21:00'), ev('o2', '08:00', '09:00')], new Date('2030-01-01T00:00:00Z'));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('UID:o1@reservas-ipi-dourados');
    expect(ics).toContain(`DTSTART:${carimboUtc(t('19:00'))}`);
    expect(ics).toContain('SUMMARY:[S03] Ensaio do louvor\\, quinta');
    expect(ics).toContain('\;');
    expect(ics.endsWith('\r\n')).toBe(true);
    for (const linha of ics.split('\r\n')) expect(Buffer.byteLength(linha)).toBeLessThanOrEqual(75);
  });
});

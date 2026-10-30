import { describe, expect, it } from 'vitest';
import { lerPrefixo, semPrefixo, tituloPadronizado } from '@/domain/prefixo';
import { codigoSala } from '@/domain/sala';

describe('leitura do prefixo [Snn]', () => {
  it.each([
    ['[S03] Reunião de diáconos', 3],
    ['[S3] Reunião', 3],
    ['[s03] Reunião', 3],
    ['  [ S 12 ]Ensaio', 12],
    ['[S120] Grande', 120],
  ])('"%s" → sala %i', (titulo, n) => expect(lerPrefixo(titulo)).toBe(n));

  it.each(['Reunião [S03]', 'S03 Reunião', '[X03] Reunião', '[S] Nada', '[S00] Zero', '', '(S03) Reunião'])(
    '"%s" → sem sala',
    (titulo) => expect(lerPrefixo(titulo)).toBeNull(),
  );

  it('padroniza o título', () => {
    expect(tituloPadronizado(3, '[s3]   Reunião de diáconos')).toBe('[S03] Reunião de diáconos');
    expect(tituloPadronizado(2, 'Ensaio')).toBe('[S02] Ensaio');
    expect(semPrefixo('[S03] Ensaio')).toBe('Ensaio');
    expect(codigoSala(7)).toBe('S07');
    expect(codigoSala(15)).toBe('S15');
  });
});

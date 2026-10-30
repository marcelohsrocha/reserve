import { describe, expect, it } from 'vitest';
import { gerarOcorrencias, RecorrenciaInvalida } from '@/domain/ocorrencias';

describe('geração de ocorrências por intervalo de datas', () => {
  it('de 03/11 a 07/11, das 19h às 21h, gera 5 ocorrências no mesmo horário', () => {
    const oc = gerarOcorrencias({ dataInicio: '2030-11-03', dataFim: '2030-11-07', horaInicio: '19:00', horaFim: '21:00' });
    expect(oc).toHaveLength(5);
    // Campo Grande = UTC-4: 19h local → 23h UTC.
    expect(oc[0].inicio.toISOString()).toBe('2030-11-03T23:00:00.000Z');
    expect(oc[0].fim.toISOString()).toBe('2030-11-04T01:00:00.000Z');
    expect(oc[4].inicio.toISOString()).toBe('2030-11-07T23:00:00.000Z');
  });

  it('data inicial igual à final gera uma única ocorrência', () => {
    expect(gerarOcorrencias({ dataInicio: '2030-11-03', dataFim: '2030-11-03', horaInicio: '08:00', horaFim: '09:30' })).toHaveLength(1);
  });

  it('filtra por dias da semana (só terças e quintas)', () => {
    // 01/11/2030 (sexta) a 30/11/2030 → terças: 5,12,19,26 / quintas: 7,14,21,28
    const oc = gerarOcorrencias({ dataInicio: '2030-11-01', dataFim: '2030-11-30', horaInicio: '19:00', horaFim: '21:00', diasSemana: [2, 4] });
    expect(oc).toHaveLength(8);
    expect(oc.map((o) => o.inicio.toISOString().slice(0, 10))).toEqual([
      '2030-11-05', '2030-11-07', '2030-11-12', '2030-11-14', '2030-11-19', '2030-11-21', '2030-11-26', '2030-11-28',
    ]);
  });

  it('atravessa a virada de mês e ano', () => {
    expect(gerarOcorrencias({ dataInicio: '2030-12-30', dataFim: '2031-01-02', horaInicio: '10:00', horaFim: '11:00' })).toHaveLength(4);
  });

  it('rejeita entradas inválidas', () => {
    const base = { dataInicio: '2030-11-03', dataFim: '2030-11-07', horaInicio: '19:00', horaFim: '21:00' };
    expect(() => gerarOcorrencias({ ...base, dataFim: '2030-11-01' })).toThrow(RecorrenciaInvalida);
    expect(() => gerarOcorrencias({ ...base, horaFim: '18:00' })).toThrow(RecorrenciaInvalida);
    expect(() => gerarOcorrencias({ ...base, horaInicio: '25:00' })).toThrow(RecorrenciaInvalida);
    expect(() => gerarOcorrencias({ ...base, dataFim: '2030-11-04', diasSemana: [6] })).toThrow(/Nenhum dia/);
  });
});

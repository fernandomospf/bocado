import { addDays, isTargetsOutdated, movingAverages, summarizeTrend } from './weight.math';

describe('movingAverages', () => {
  it('calcula a média dos registros dentro dos 7 dias anteriores, inclusive o dia', () => {
    const out = movingAverages([
      { date: '2026-11-01', weightKg: 90 },
      { date: '2026-11-02', weightKg: 92 },
      { date: '2026-11-03', weightKg: 94 },
    ]);
    expect(out.map((p) => p.trendKg)).toEqual([90, 91, 92]);
  });

  it('com dias faltando, usa só os registros existentes na janela', () => {
    const out = movingAverages([
      { date: '2026-11-01', weightKg: 90 },
      { date: '2026-11-05', weightKg: 92 }, // 01 e 05 na mesma janela
      { date: '2026-11-07', weightKg: 94 }, // 01..07: ainda inclui o dia 01 (6 dias antes)
      { date: '2026-11-08', weightKg: 96 }, // 02..08: o dia 01 sai da janela
      { date: '2026-11-20', weightKg: 80 }, // janela vazia antes dele: média = o próprio valor
    ]);
    expect(out.map((p) => p.trendKg)).toEqual([90, 91, 92, 94, 80]);
  });

  it('ordena por data antes de calcular', () => {
    const out = movingAverages([
      { date: '2026-11-03', weightKg: 94 },
      { date: '2026-11-01', weightKg: 90 },
    ]);
    expect(out.map((p) => p.date)).toEqual(['2026-11-01', '2026-11-03']);
    expect(out[1].trendKg).toBe(92);
  });

  it('atravessa a virada do mês corretamente', () => {
    const out = movingAverages([
      { date: '2026-10-28', weightKg: 90 },
      { date: '2026-11-03', weightKg: 92 }, // 6 dias depois: mesma janela
      { date: '2026-11-04', weightKg: 94 }, // 7 dias depois do dia 28: o 28 sai
    ]);
    expect(out.map((p) => p.trendKg)).toEqual([90, 91, 93]);
  });
});

describe('summarizeTrend', () => {
  it('sem registros, tudo nulo', () => {
    expect(summarizeTrend([])).toEqual({ latest: null, trendKg: null, change7Kg: null, change30Kg: null });
  });

  it('variação pela tendência, usando o último registro até N dias antes', () => {
    const start = '2026-10-01';
    // Um registro por dia, perdendo 0,1 kg por dia, por 40 dias
    const points = Array.from({ length: 40 }, (_, i) => ({ date: addDays(start, i), weightKg: 100 - i * 0.1 }));
    const s = summarizeTrend(points);
    expect(s.latest).toEqual({ date: addDays(start, 39), weightKg: 96.1 });
    expect(s.trendKg).toBeCloseTo(96.4, 5); // média de 96,7 a 96,1
    expect(s.change7Kg).toBeCloseTo(-0.7, 5);
    expect(s.change30Kg).toBeCloseTo(-3, 5);
  });

  it('sem registro tão antigo, a variação fica nula', () => {
    const s = summarizeTrend([
      { date: '2026-11-01', weightKg: 90 },
      { date: '2026-11-10', weightKg: 89 },
    ]);
    expect(s.change7Kg).toBe(-1);
    expect(s.change30Kg).toBeNull();
  });
});

describe('isTargetsOutdated', () => {
  it('é true exatamente no limite de 2 kg (nos dois sentidos)', () => {
    expect(isTargetsOutdated(96.2, 94.2)).toBe(true);
    expect(isTargetsOutdated(92.2, 94.2)).toBe(true);
  });

  it('é false logo abaixo do limite', () => {
    expect(isTargetsOutdated(96.19, 94.2)).toBe(false);
    expect(isTargetsOutdated(92.21, 94.2)).toBe(false);
  });

  it('é false sem tendência ou sem peso das metas', () => {
    expect(isTargetsOutdated(null, 94.2)).toBe(false);
    expect(isTargetsOutdated(96.2, null)).toBe(false);
  });
});

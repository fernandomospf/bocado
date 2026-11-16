import { largestRemainder, splitItems } from './split';


describe('largestRemainder', () => {
  it('a soma das partes é sempre o total', () => {
    for (const shares of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.4], [0.7, 0.3], [0.15, 0.35, 0.5], [0.1, 0.1, 0.1, 0.1, 0.1, 0.5]]) {
      for (const total of [0, 1, 7, 100, 333, 1999, 12345]) {
        const parts = largestRemainder(total, shares);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(parts.every((p) => Number.isInteger(p) && p >= 0)).toBe(true);
      }
    }
  });

  it('1 g dividido em 3: a sobra vai para o primeiro (empate)', () => {
    expect(largestRemainder(10, [1 / 3, 1 / 3, 1 / 3])).toEqual([4, 3, 3]);
  });

  it('a sobra vai para quem tem o maior resto', () => {
    // 5 décimos em 50/30/20: cotas 2,5 / 1,5 / 1,0 → pisos 2/1/1 = 4, sobra 1 para o primeiro resto (0,5; empate → primeiro)
    expect(largestRemainder(5, [0.5, 0.3, 0.2])).toEqual([3, 1, 1]);
  });
});

describe('splitItems', () => {
  const items = [
    { name: 'Arroz', grams: 333.3, kcal: 427.1, protein: 8.3, carbs: 93.7, fat: 0.7 },
    { name: 'Frango', grams: 211.7, kcal: 348.9, protein: 65.1, carbs: 0, fat: 7.9, estimated: true },
    { name: 'Azeite', grams: 0.1, kcal: 0.9, protein: 0, carbs: 0, fat: 0.1 },
  ];

  it.each([
    [[0.5, 0.5]],
    [[0.6, 0.4]],
    [[1 / 3, 1 / 3, 1 / 3]],
    [[0.55, 0.25, 0.1, 0.1]],
    [[0.05, 0.95]],
  ])('soma EXATA das cópias igual ao original em cada alimento e campo (%j)', (shares) => {
    const parts = splitItems(items, shares);
    expect(parts).toHaveLength(shares.length);
    items.forEach((orig, idx) => {
      for (const f of ['grams', 'kcal', 'protein', 'carbs', 'fat'] as const) {
        const total = parts.reduce((s, p) => s + Math.round(p[idx][f] * 10), 0);
        expect(total).toBe(Math.round(orig[f] * 10));
      }
    });
  });

  it('mantém nome e marca de estimativa, e escala pela fração', () => {
    const [a, b] = splitItems(items, [0.6, 0.4]);
    expect(a[1]).toMatchObject({ name: 'Frango', estimated: true });
    expect(a[0].kcal).toBeCloseTo(256.3, 1);
    expect(b[0].kcal).toBeCloseTo(170.8, 1);
  });
});

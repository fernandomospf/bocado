import { coerceAiSuggestions, rescore } from './close-day.ai';

const rem = { kcal: 600, protein: 45, carbs: 55, fat: 18 };

describe('coerceAiSuggestions (não confia nos números do modelo)', () => {
  it('recalcula os totais pela soma dos ingredientes e marca fit/good pelo critério local', () => {
    const out = coerceAiSuggestions(
      {
        suggestions: [
          {
            title: 'Omelete com arroz',
            items: [
              { name: 'Ovos', grams: 150, kcal: 215, protein: 19, carbs: 1, fat: 15 },
              { name: 'Arroz cozido', grams: 200, kcal: 256, protein: 5, carbs: 56, fat: 0.4 },
              { name: 'Peito de frango', grams: 80, kcal: 127, protein: 25.6, carbs: 0, fat: 2 },
            ],
            steps: ['Bata os ovos', 'Faça a omelete', 'Sirva com o arroz'],
            minutes: 15,
            totals: { kcal: 9999 }, // ignorado: totais são sempre recalculados
          },
        ],
      },
      rem,
    );
    expect(out).toHaveLength(1);
    expect(out[0].totals).toEqual({ kcal: 598, protein: 49.6, carbs: 57, fat: 17.4 });
    expect(out[0].good).toBe(true);
    expect(out[0].fit).toBeGreaterThan(0.8);
    expect(out[0]).toMatchObject({ origin: 'ai', mainOrigin: 'ai', minutes: 15, steps: ['Bata os ovos', 'Faça a omelete', 'Sirva com o arroz'] });
  });

  it('kcal declarada que destoa mais de 25% de 4P + 4C + 9G é substituída pelo cálculo', () => {
    const out = coerceAiSuggestions(
      { suggestions: [{ title: 'X', items: [{ name: 'Frango', grams: 100, kcal: 50, protein: 32, carbs: 0, fat: 2.5 }] }] },
      rem,
    );
    expect(out[0].items[0].kcal).toBe(151); // 32×4 + 2,5×9
  });

  it('marca como não boa quando os totais reais não atingem o critério', () => {
    const out = coerceAiSuggestions(
      { suggestions: [{ title: 'Salada', items: [{ name: 'Alface', grams: 100, kcal: 400, protein: 1.3, carbs: 1.7, fat: 0.2 }] }] },
      rem,
    );
    expect(out[0].totals.kcal).toBe(14); // a kcal inventada (400) não sobrevive
    expect(out[0].good).toBe(false);
  });

  it('aceita listas como string JSON malformada e descarta ingredientes inválidos', () => {
    const out = coerceAiSuggestions(
      {
        suggestions:
          '[{"title":"Feijão com arroz","items":[{"name":"Feijão","grams":"150 g","kcal":114,"protein":7.2,"carbs":20.4,"fat":0.8},{"name":"","grams":100},{"name":"Arroz","grams":0}],"steps":"1. Esquente\\n2. Sirva","minutes":"10 min"}]',
      },
      rem,
    );
    expect(out[0].items.map((i) => i.name)).toEqual(['Feijão']);
    expect(out[0].items[0].grams).toBe(150);
    expect(out[0].steps).toEqual(['Esquente', 'Sirva']);
    expect(out[0].minutes).toBe(10);
  });

  it('no máximo 2 sugestões e 3 passos', () => {
    const s = { title: 'S', items: [{ name: 'Ovo', grams: 100, kcal: 146, protein: 13, carbs: 1, fat: 10 }], steps: ['a', 'b', 'c', 'd'] };
    const out = coerceAiSuggestions({ suggestions: [s, s, s] }, rem);
    expect(out).toHaveLength(2);
    expect(out[0].steps).toHaveLength(3);
  });

  it('resposta inútil → lista vazia', () => {
    expect(coerceAiSuggestions('nada aqui', rem)).toEqual([]);
    expect(coerceAiSuggestions({ suggestions: [{ title: 'Sem itens', items: [] }] }, rem)).toEqual([]);
  });
});

describe('rescore', () => {
  it('recalcula fit/good contra o que falta para este usuário (ex.: resposta vinda do cache)', () => {
    const [s] = coerceAiSuggestions(
      { suggestions: [{ title: 'S', items: [{ name: 'Frango', grams: 200, kcal: 318, protein: 64, carbs: 0, fat: 5 }] }] },
      { kcal: 320, protein: 60, carbs: 0, fat: 5 },
    );
    expect(s.good).toBe(true);
    expect(rescore([s], { kcal: 900, protein: 60, carbs: 90, fat: 30 })[0].good).toBe(false);
  });
});

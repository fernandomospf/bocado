import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatFoodName } from '../foods/food-names';
import {
  amountLabel,
  familyOf,
  Food,
  isDayClosed,
  isGoodEnough,
  KIND_LIMITS,
  kindOf,
  mealGroupKey,
  mealTarget,
  pantrySuggestions,
  parsePantry,
  pickDiverse,
  priorityOf,
  remaining,
  ResolvedTemplate,
  scaleHistoryMeal,
  solvePlate,
  Suggestion,
  templateSuggestions,
} from './close-day.math';
import { MEAL_TEMPLATES } from './meal-templates';

// ---------------------------------------------------------------------------
// Dados reais da TACO (mesmo arquivo do seed), sem banco: os modelos rodam com os números de produção
// ---------------------------------------------------------------------------
interface TacoRow {
  name: string;
  category: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}
interface PortionRow {
  food: string;
  grams: number;
  label: string;
}
const dataDir = join(__dirname, '../../prisma/data');
const taco: TacoRow[] = JSON.parse(readFileSync(join(dataDir, 'taco.json'), 'utf8'));
const portions: PortionRow[] = JSON.parse(readFileSync(join(dataDir, 'portions.json'), 'utf8'));
const portionOf = new Map(portions.map((p) => [p.food, p]));
const tacoFood = (name: string): Food => {
  const row = taco.find((t) => t.name === name);
  if (!row) throw new Error(`Ausente na TACO: ${name}`);
  const portion = portionOf.get(name);
  return {
    name: formatFoodName(row.name, row.category),
    per100: { kcal: row.kcal, protein: row.protein, carbs: row.carbs, fat: row.fat },
    portionGrams: portion?.grams ?? null,
    portionLabel: portion?.label ?? null,
  };
};
const resolve = (moment: 'DINNER' | 'SNACK'): ResolvedTemplate[] =>
  MEAL_TEMPLATES.filter((t) => t.moment === moment).map((template) => ({
    template,
    slots: template.slots.map((s) => ({ food: tacoFood(s.food), role: s.role, grams: s.grams })),
  }));

const targets = { kcal: 2100, protein: 150, carbs: 220, fat: 70 };
/** Caso real relatado: faltavam ~806 kcal e 48 g de proteína. */
const REAL = { kcal: 806, protein: 48, carbs: 95, fat: 25 };

describe('quanto falta', () => {
  it('remaining nunca negativo', () => {
    expect(remaining(targets, { kcal: 1480, protein: 102, carbs: 160, fat: 80 })).toEqual({ kcal: 620, protein: 48, carbs: 60, fat: 0 });
  });

  it('dia fechado com menos de 150 kcal ou meta batida', () => {
    expect(isDayClosed(targets, { kcal: 1960, protein: 0, carbs: 0, fat: 0 })).toBe(true);
    expect(isDayClosed(targets, { kcal: 1950, protein: 0, carbs: 0, fat: 0 })).toBe(false);
    expect(isDayClosed(targets, { kcal: 2300, protein: 0, carbs: 0, fat: 0 })).toBe(true);
  });

  it('uma refeição mira no máximo 40% da meta diária', () => {
    expect(mealTarget({ kcal: 2100, protein: 150, carbs: 220, fat: 70 }, targets)).toEqual({ kcal: 840, protein: 60, carbs: 88, fat: 28 });
    expect(mealTarget(REAL, targets)).toBe(REAL);
  });

  it('proteína é prioridade quando é o maior déficit relativo', () => {
    expect(priorityOf({ kcal: 600, protein: 60, carbs: 40, fat: 10 }, targets)).toBe('protein');
    expect(priorityOf({ kcal: 600, protein: 10, carbs: 110, fat: 10 }, targets)).toBe('balanced');
  });
});

describe('categorias, famílias e quantidades', () => {
  it.each([
    ['Peito de frango grelhado', 'meat'],
    ['Ovo cozido', 'egg'],
    ['Arroz branco cozido', 'starch'],
    ['Feijão carioca cozido', 'legume'],
    ['Pão de milho de forma', 'bread'],
    ['Iogurte natural', 'dairy'],
    ['Queijo minas frescal', 'cheese'],
    ['Alface crespa', 'veg'],
    ['Banana-prata', 'fruit'],
  ])('%s → %s', (name, kind) => {
    expect(kindOf(name)).toBe(kind);
  });

  it('famílias agrupam variações ("peito" e "coxa" de frango são a mesma proteína)', () => {
    expect(familyOf('Peito de frango grelhado')).toBe(familyOf('Coxa de frango cozida'));
    expect(familyOf('Carne moída (acém) cozida')).toBe(familyOf('Patinho grelhado'));
    expect(familyOf('Batata-doce cozida')).not.toBe(familyOf('Batata cozida'));
  });

  it('quantidade amigável: ovos, medida caseira ou gramas', () => {
    expect(amountLabel(tacoFood('Ovo, de galinha, inteiro, cozido/10minutos'), 100)).toBe('2 ovos cozidos');
    expect(amountLabel(tacoFood('Ovo, de galinha, inteiro, frito'), 50)).toBe('1 ovo frito');
    expect(amountLabel(tacoFood('Feijão, carioca, cozido'), 86)).toBe('1 concha de feijão carioca cozido');
    expect(amountLabel(tacoFood('Arroz, tipo 1, cozido'), 250)).toBe('2 escumadeiras de arroz branco cozido');
    expect(amountLabel(tacoFood('Frango, peito, sem pele, grelhado'), 150)).toBe('150 g Peito de frango grelhado');
  });
});

describe('solvePlate: proteína → fixos → carboidrato', () => {
  const frango = tacoFood('Frango, peito, sem pele, grelhado');
  const arroz = tacoFood('Arroz, tipo 1, cozido');
  const feijao = tacoFood('Feijão, carioca, cozido');
  const alface = tacoFood('Alface, crespa, crua');

  it('a proteína vem primeiro (85–110% do que falta) e o carboidrato completa as kcal', () => {
    const items = solvePlate(
      [
        { food: frango, role: 'protein' },
        { food: arroz, role: 'fill' },
        { food: feijao, role: 'fixed', grams: 86 },
        { food: alface, role: 'fixed', grams: 50 },
      ],
      { kcal: 600, protein: 40, carbs: 60, fat: 15 },
    )!;
    const protein = items.reduce((t, i) => t + i.protein, 0);
    const kcal = items.reduce((t, i) => t + i.kcal, 0);
    expect(protein).toBeGreaterThanOrEqual(40 * 0.85);
    expect(protein).toBeLessThanOrEqual(40 * 1.1);
    expect(Math.abs(kcal - 600) / 600).toBeLessThanOrEqual(0.15);
    expect(items[2].grams).toBe(86); // feijão: 1 concha exata
    expect(items[3].grams).toBe(60); // verdura fixa e leve: 60–120 g
  });

  it('respeita os limites da categoria (carne 80–250 g; pão 25–100 g; múltiplos de 10)', () => {
    const items = solvePlate([{ food: frango, role: 'protein' }, { food: tacoFood('Pão, milho, forma'), role: 'fill' }], REAL)!;
    expect(items[0].grams).toBeGreaterThanOrEqual(KIND_LIMITS.meat.min);
    expect(items[0].grams).toBeLessThanOrEqual(KIND_LIMITS.meat.max);
    expect(items[1].grams).toBeLessThanOrEqual(100);
    expect(items[0].grams % 10).toBe(0);
  });

  it('ovos em múltiplos de 50 g (1 ovo)', () => {
    const items = solvePlate([{ food: tacoFood('Ovo, de galinha, inteiro, cozido/10minutos'), role: 'protein' }, { food: arroz, role: 'fill' }], { kcal: 450, protein: 25, carbs: 45, fat: 12 })!;
    expect(items[0].grams % 50).toBe(0);
  });

  it('descarta quando a proteína não chega a 70% dentro dos limites', () => {
    // Queijo: no máximo 60 g (~10 g de proteína) não cobre 48 g
    expect(solvePlate([{ food: tacoFood('Queijo, minas, frescal'), role: 'protein' }, { food: arroz, role: 'fill' }], REAL)).toBeNull();
  });
});

describe('caso real: faltam 806 kcal e 48 g de proteína (jantar)', () => {
  const all = templateSuggestions(resolve('DINNER'), REAL);
  const picked = pickDiverse([], all, REAL);

  it('nenhuma sugestão com menos de 41 g de proteína', () => {
    expect(picked.length).toBeGreaterThan(0);
    for (const s of picked) expect(s.totals.protein).toBeGreaterThanOrEqual(41);
  });

  it('nenhum pão acima de 100 g', () => {
    for (const s of all) for (const i of s.items) if (kindOf(i.name) === 'bread') expect(i.grams).toBeLessThanOrEqual(100);
  });

  it('as opções têm proteínas E carboidratos principais diferentes', () => {
    const proteins = picked.map((s) => s.proteinFamily);
    const carbs = picked.map((s) => s.carbFamily);
    expect(new Set(proteins).size).toBe(proteins.length);
    expect(new Set(carbs).size).toBe(carbs.length);
  });

  it('nomes naturais, sem a forma crua da TACO', () => {
    const rawNames = new Set(taco.map((t) => t.name));
    for (const s of picked) {
      expect(rawNames.has(s.title)).toBe(false); // vírgula de enumeração no título é normal
      for (const i of s.items) expect(i.name).not.toMatch(/,/);
    }
  });

  it('kcal das opções finais entre 75% e 115% do alvo', () => {
    for (const s of picked) {
      expect(s.totals.kcal).toBeGreaterThanOrEqual(806 * 0.75);
      expect(s.totals.kcal).toBeLessThanOrEqual(806 * 1.15);
    }
  });
});

describe('histórico: refeições que a pessoa já comeu', () => {
  const dinner = {
    times: 4,
    items: [
      { name: 'Peito de frango grelhado', grams: 150, kcal: 239, protein: 48, carbs: 0, fat: 3.8 },
      { name: 'Arroz branco cozido', grams: 200, kcal: 257, protein: 5, carbs: 56.2, fat: 0.4 },
    ],
  };

  it('agrupa refeições iguais independentemente da ordem e de diferenças < 5 g', () => {
    expect(mealGroupKey([{ name: 'Arroz', grams: 201 }, { name: 'Frango', grams: 150 }])).toBe(
      mealGroupKey([{ name: 'Frango', grams: 148 }, { name: 'Arroz', grams: 199 }]),
    );
  });

  it('escala a refeição inteira por um único fator para aproximar as kcal', () => {
    const s = scaleHistoryMeal(dinner, { kcal: 600, protein: 50, carbs: 60, fat: 10 })!;
    // fator ≈ 600 / 496 ≈ 1,21: frango 150 → 180 g; arroz 200 → 240 g
    expect(s.items.map((i) => i.grams)).toEqual([180, 240]);
    expect(s.mainOrigin).toBe('history');
    expect(s.good).toBe(true);
  });

  it('o fator fica entre 0,6 e 1,6; se não passar no critério, não entra', () => {
    expect(scaleHistoryMeal(dinner, { kcal: 1600, protein: 120, carbs: 150, fat: 40 })).toBeNull(); // precisaria de 3,2×
  });

  it('o histórico vem antes dos modelos', () => {
    const fromHistory = scaleHistoryMeal(dinner, REAL)!;
    const picked = pickDiverse([fromHistory], templateSuggestions(resolve('DINNER'), REAL), REAL);
    expect(picked[0].mainOrigin).toBe('history');
  });
});

describe('despensa ("O que tem em casa?")', () => {
  it('"frango, 2 ovos e arroz" → 3 itens, com a quantidade dos ovos', () => {
    expect(parsePantry('frango, 2 ovos e arroz')).toEqual([
      { term: 'frango', quantity: null },
      { term: 'ovos', quantity: 2 },
      { term: 'arroz', quantity: null },
    ]);
  });

  it('aceita ; + e quebras de linha, sem repetir', () => {
    expect(parsePantry('Arroz; feijão + salada\narroz').map((t) => t.term)).toEqual(['arroz', 'feijão', 'salada']);
  });

  it('monta pratos só com os ingredientes (e salada genérica) e respeita "2 ovos"', () => {
    const veg = [tacoFood('Alface, crespa, crua'), tacoFood('Tomate, com semente, cru')];
    const out = pantrySuggestions(
      [
        { food: tacoFood('Ovo, de galinha, inteiro, cozido/10minutos'), quantity: 2 },
        { food: tacoFood('Arroz, tipo 1, cozido'), quantity: null },
      ],
      { kcal: 400, protein: 12, carbs: 50, fat: 10 },
      veg,
    );
    expect(out).toHaveLength(1);
    expect(out[0].items[0].grams).toBeLessThanOrEqual(100); // no máximo 2 ovos
    const names = out[0].items.map((i) => i.name);
    expect(names).toEqual(['Ovo cozido', 'Arroz branco cozido', 'Alface crespa', 'Tomate']);
    expect(out[0].mainOrigin).toBe('pantry');
  });

  it('sem proteína na despensa, nenhum prato (vai para a IA)', () => {
    const out = pantrySuggestions([{ food: tacoFood('Batata, inglesa, cozida'), quantity: null }], REAL, []);
    expect(out).toEqual([]);
  });
});

describe('pickDiverse', () => {
  const s = (protein: string, carb: string, totals = { kcal: 800, protein: 48, carbs: 90, fat: 25 }): Suggestion => ({
    title: `${protein} com ${carb}`,
    items: [],
    totals,
    fit: 1,
    good: isGoodEnough(totals, REAL),
    origin: 'local',
    mainOrigin: 'template',
    proteinFamily: protein,
    carbFamily: carb,
  });

  it('pula proteína ou carboidrato repetidos', () => {
    const out = pickDiverse([], [s('frango', 'arroz'), s('frango', 'batata'), s('carne', 'arroz'), s('ovo', 'pao')], REAL);
    expect(out.map((x) => x.title)).toEqual(['frango com arroz', 'ovo com pao']);
  });

  it('na despensa, basta variar a proteína', () => {
    const out = pickDiverse([], [s('frango', 'arroz'), s('ovo', 'arroz')], REAL, { distinctCarb: false });
    expect(out).toHaveLength(2);
  });

  it('no modo despensa (não estrito), devolve o melhor possível mesmo fora da faixa', () => {
    const weak = s('frango', 'arroz', { kcal: 580, protein: 48, carbs: 70, fat: 8 });
    expect(pickDiverse([], [weak], REAL)).toEqual([]);
    expect(pickDiverse([], [weak], REAL, { strict: false })).toEqual([weak]);
  });

  it('recusa proteína abaixo de 85% ou kcal fora de 75–115% do alvo', () => {
    const out = pickDiverse([], [s('frango', 'arroz', { kcal: 800, protein: 30, carbs: 90, fat: 25 }), s('carne', 'batata', { kcal: 380, protein: 50, carbs: 40, fat: 10 })], REAL);
    expect(out).toEqual([]);
  });
});

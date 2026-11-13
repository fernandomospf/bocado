import {
  buildLocalSuggestions,
  Candidate,
  classify,
  isDayClosed,
  isGoodEnough,
  isMealFriendlyTaco,
  MAX_COMBINATIONS,
  mealTarget,
  priorityOf,
  remaining,
  solvePortions,
} from './close-day.math';

const targets = { kcal: 2100, protein: 150, carbs: 220, fat: 70 };

const taco = (key: string, name: string, category: string, per100: Candidate['per100'], portionGrams?: number): Candidate => ({
  key,
  name,
  category,
  per100,
  origin: 'taco',
  portionGrams: portionGrams ?? null,
});

const FRANGO = taco('frango', 'Frango, peito, sem pele, grelhado', 'Carnes e derivados', { kcal: 159, protein: 32, carbs: 0, fat: 2.5 });
const CARNE = taco('carne', 'Carne, bovina, acém, moído, cozido', 'Carnes e derivados', { kcal: 212, protein: 26.7, carbs: 0, fat: 10.9 });
const OVO = taco('ovo', 'Ovo, de galinha, inteiro, cozido/10minutos', 'Ovos e derivados', { kcal: 146, protein: 13.3, carbs: 0.6, fat: 9.5 }, 50);
const ARROZ = taco('arroz', 'Arroz, tipo 1, cozido', 'Cereais e derivados', { kcal: 128, protein: 2.5, carbs: 28.1, fat: 0.2 }, 125);
const FEIJAO = taco('feijao', 'Feijão, carioca, cozido', 'Leguminosas e derivados', { kcal: 76, protein: 4.8, carbs: 13.6, fat: 0.5 }, 86);
const ALFACE = taco('alface', 'Alface, crespa, crua', 'Verduras, hortaliças e derivados', { kcal: 11, protein: 1.3, carbs: 1.7, fat: 0.2 });
const BASE = [FRANGO, CARNE, OVO, ARROZ, FEIJAO, ALFACE];

describe('remaining', () => {
  it('calcula o que falta, nunca negativo', () => {
    expect(remaining(targets, { kcal: 1480, protein: 102, carbs: 160, fat: 80 })).toEqual({
      kcal: 620,
      protein: 48,
      carbs: 60,
      fat: 0,
    });
  });

  it('dia fechado com menos de 150 kcal restantes ou meta batida', () => {
    expect(isDayClosed(targets, { kcal: 1960, protein: 0, carbs: 0, fat: 0 })).toBe(true); // faltam 140
    expect(isDayClosed(targets, { kcal: 1950, protein: 0, carbs: 0, fat: 0 })).toBe(false); // faltam 150
    expect(isDayClosed(targets, { kcal: 2300, protein: 0, carbs: 0, fat: 0 })).toBe(true);
  });

  it('uma refeição mira no máximo 40% da meta diária, com macros proporcionais', () => {
    // Nada registrado: faltam 2.100 kcal, mas o jantar sugerido mira 840
    expect(mealTarget({ kcal: 2100, protein: 150, carbs: 220, fat: 70 }, targets)).toEqual({ kcal: 840, protein: 60, carbs: 88, fat: 28 });
    // Abaixo do limite, o alvo é o próprio restante
    const rem = { kcal: 620, protein: 48, carbs: 60, fat: 15 };
    expect(mealTarget(rem, targets)).toBe(rem);
  });

  it('proteína é prioridade quando é o maior déficit relativo', () => {
    expect(priorityOf({ kcal: 600, protein: 60, carbs: 40, fat: 10 }, targets)).toBe('protein'); // 40% da meta
    expect(priorityOf({ kcal: 600, protein: 10, carbs: 110, fat: 10 }, targets)).toBe('balanced');
  });
});

describe('candidatos da TACO', () => {
  it.each([
    ['Frango, peito, sem pele, grelhado', 'Carnes e derivados', true],
    ['Alface, crespa, crua', 'Verduras, hortaliças e derivados', true], // cru ok em verduras
    ['Arroz, tipo 1, cru', 'Cereais e derivados', false], // carboidrato cru não
    ['Frango, peito, sem pele, cru', 'Carnes e derivados', false],
    ['Farinha, de mandioca, crua', 'Cereais e derivados', false],
    ['Biscoito, doce, maisena', 'Cereais e derivados', false],
    ['Leite, condensado', 'Leite e derivados', false],
    ['Cerveja, pilsen', 'Bebidas (alcoólicas e não alcoólicas)', false],
    ['Açúcar, refinado', 'Produtos açucarados', false],
    ['Óleo, de soja', 'Gorduras e óleos', false],
    ['Sal, grosso', 'Miscelâneas', false],
  ])('%s (%s) → %p', (name, category, expected) => {
    expect(isMealFriendlyTaco(name, category)).toBe(expected);
  });

  it('classifica por perfil de macros, com tubérculo como carboidrato', () => {
    expect(classify(FRANGO)).toBe('protein');
    expect(classify(ARROZ)).toBe('carb');
    expect(classify(ALFACE)).toBe('veg');
    expect(classify(taco('b', 'Batata, inglesa, cozida', 'Verduras, hortaliças e derivados', { kcal: 52, protein: 1.2, carbs: 11.9, fat: 0 }))).toBe('carb');
  });
});

describe('solvePortions', () => {
  const rem = { kcal: 620, protein: 48, carbs: 60, fat: 15 };

  it('respeita passos de 10 g (ou múltiplos da porção caseira), mínimo de 30 g e máximo de 400 g; verdura até 150 g', () => {
    const grams = solvePortions([FRANGO, ARROZ, ALFACE], rem);
    grams.forEach((g, i) => {
      const portion = [FRANGO, ARROZ, ALFACE][i].portionGrams;
      const onGrid = g % 10 === 0 || (portion ? Math.abs(g / (portion / 2) - Math.round(g / (portion / 2))) < 1e-6 : false);
      expect(onGrid).toBe(true);
      expect(g).toBeGreaterThanOrEqual(30);
      expect(g).toBeLessThanOrEqual(400);
    });
    expect(grams[2]).toBeLessThanOrEqual(150);
  });

  it('chega perto do que falta', () => {
    const grams = solvePortions([FRANGO, ARROZ], rem);
    const kcal = (FRANGO.per100.kcal * grams[0] + ARROZ.per100.kcal * grams[1]) / 100;
    const protein = (FRANGO.per100.protein * grams[0] + ARROZ.per100.protein * grams[1]) / 100;
    expect(protein).toBeGreaterThanOrEqual(48 * 0.85);
    expect(kcal).toBeLessThanOrEqual(620 * 1.1);
  });

  it('usa a porção caseira quando quase não piora (arroz em múltiplos de ½ escumadeira = 62,5 g)', () => {
    const grams = solvePortions([FRANGO, ARROZ], rem);
    expect((grams[1] / 62.5) % 1).toBeCloseTo(0, 5);
  });
});

describe('isGoodEnough', () => {
  const rem = { kcal: 600, protein: 40, carbs: 60, fat: 15 };
  it('kcal dentro de ±15% E proteína com pelo menos 85% do que falta', () => {
    expect(isGoodEnough({ kcal: 690, protein: 34, carbs: 0, fat: 0 }, rem)).toBe(true); // +15%, 85%
    expect(isGoodEnough({ kcal: 510, protein: 40, carbs: 0, fat: 0 }, rem)).toBe(true); // −15%
    expect(isGoodEnough({ kcal: 700, protein: 40, carbs: 0, fat: 0 }, rem)).toBe(false); // +16,7%
    expect(isGoodEnough({ kcal: 600, protein: 33, carbs: 0, fat: 0 }, rem)).toBe(false); // 82,5%
  });
});

describe('buildLocalSuggestions', () => {
  const rem = { kcal: 620, protein: 48, carbs: 60, fat: 15 };

  it('não sugere nada com menos de 150 kcal restantes', () => {
    expect(buildLocalSuggestions({ kcal: 140, protein: 10, carbs: 10, fat: 5 }, BASE).suggestions).toEqual([]);
  });

  it('até 3 sugestões, cada uma com um alimento principal diferente', () => {
    const { suggestions } = buildLocalSuggestions(rem, BASE);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    const mains = suggestions.map((s) => s.items[0].name);
    expect(new Set(mains).size).toBe(mains.length);
    expect(suggestions[0]).toMatchObject({ origin: 'local' });
    expect(suggestions[0].good).toBe(true);
  });

  it('título legível ("Frango grelhado com arroz e alface")', () => {
    const { suggestions } = buildLocalSuggestions(rem, [FRANGO, ARROZ, ALFACE]);
    expect(suggestions[0].title).toMatch(/^Frango grelhado com arroz/);
  });

  it('prioriza o histórico do usuário sobre a TACO equivalente', () => {
    const fromHistory: Candidate = { ...FRANGO, key: 'h:frango', name: 'Frango grelhado da casa', origin: 'history', timesUsed: 12 };
    const { suggestions } = buildLocalSuggestions(rem, [FRANGO, fromHistory, ARROZ, ALFACE]);
    expect(suggestions[0].mainOrigin).toBe('history');
    expect(suggestions[0].items[0].name).toBe('Frango grelhado da casa');
  });

  it('avalia no máximo 300 combinações', () => {
    const many: Candidate[] = [];
    for (let i = 0; i < 20; i++) {
      many.push({ ...FRANGO, key: `p${i}`, name: `Frango ${i}` });
      many.push({ ...ARROZ, key: `c${i}`, name: `Arroz ${i}` });
      many.push({ ...ALFACE, key: `v${i}`, name: `Alface ${i}` });
    }
    expect(buildLocalSuggestions(rem, many).evaluated).toBeLessThanOrEqual(MAX_COMBINATIONS);
  });
});

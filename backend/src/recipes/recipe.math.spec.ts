import { computeRecipe } from './recipe.math';

// Arroz: 500 g crus (TACO cru ~358 kcal/100 g) + 20 g de óleo
const ingredients = [
  { grams: 500, kcal: 1789, protein: 35.8, carbs: 393.8, fat: 1.7 },
  { grams: 20, kcal: 176.8, protein: 0, carbs: 0, fat: 20 },
];

describe('computeRecipe', () => {
  it('totais = soma dos ingredientes', () => {
    const r = computeRecipe(ingredients);
    expect(r.totals).toEqual({ kcal: 1965.8, protein: 35.8, carbs: 393.8, fat: 21.7 });
    expect(r.rawGrams).toBe(520);
  });

  it('sem peso cozido, a base é a soma dos crus', () => {
    const r = computeRecipe(ingredients);
    expect(r.baseGrams).toBe(520);
    expect(r.per100.kcal).toBeCloseTo((1965.8 / 520) * 100, 0);
    expect(r.weightWarning).toBe(false);
  });

  it('com peso cozido, os valores por 100 g usam o peso final', () => {
    // Arroz absorve água: 520 g crus viram 1300 g cozidos
    const r = computeRecipe(ingredients, 1300);
    expect(r.baseGrams).toBe(1300);
    expect(r.per100).toEqual({ kcal: 151.2, protein: 2.8, carbs: 30.3, fat: 1.7 });
  });

  it('porção = peso base / porções', () => {
    expect(computeRecipe(ingredients, 1300, 4).portionGrams).toBe(325);
    expect(computeRecipe(ingredients, null, 4).portionGrams).toBe(130);
    expect(computeRecipe(ingredients, 1300).portionGrams).toBeNull();
  });

  it('avisa (sem bloquear) quando o cozido difere mais de 50% do cru', () => {
    expect(computeRecipe(ingredients, 1300).weightWarning).toBe(true); // +150%
    expect(computeRecipe(ingredients, 200).weightWarning).toBe(true); // −62%
    expect(computeRecipe(ingredients, 780).weightWarning).toBe(false); // exatamente +50%: não passa do limite
    expect(computeRecipe(ingredients, 600).weightWarning).toBe(false);
  });

  it('peso cozido zero ou ausente é ignorado', () => {
    expect(computeRecipe(ingredients, 0).baseGrams).toBe(520);
    expect(computeRecipe(ingredients, undefined).baseGrams).toBe(520);
  });

  it('sem ingredientes, não divide por zero', () => {
    const r = computeRecipe([]);
    expect(r.per100).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
    expect(r.portionGrams).toBeNull();
  });
});

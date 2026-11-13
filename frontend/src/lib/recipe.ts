import type { Macros, RecipeNutrition } from './types';

/** Diferença relativa entre peso cozido e cru a partir da qual a tela pede para conferir. */
export const COOKED_WEIGHT_WARNING_RATIO = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Mesmo cálculo do servidor (backend/src/recipes/recipe.math.ts), para a prévia ao vivo no editor.
 * Base = peso cozido, se informado; senão, a soma dos crus. Porção = base / porções.
 */
export function computeRecipe(
  ingredients: (Macros & { grams: number })[],
  totalCookedGrams?: number | null,
  servings?: number | null,
): RecipeNutrition {
  const sum = ingredients.reduce(
    (t, i) => ({
      grams: t.grams + i.grams,
      kcal: t.kcal + i.kcal,
      protein: t.protein + i.protein,
      carbs: t.carbs + i.carbs,
      fat: t.fat + i.fat,
    }),
    { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const cooked = totalCookedGrams && totalCookedGrams > 0 ? totalCookedGrams : null;
  const baseGrams = cooked ?? sum.grams;
  const f = baseGrams > 0 ? 100 / baseGrams : 0;
  return {
    totals: { kcal: round1(sum.kcal), protein: round1(sum.protein), carbs: round1(sum.carbs), fat: round1(sum.fat) },
    rawGrams: round1(sum.grams),
    baseGrams: round1(baseGrams),
    per100: {
      kcal: round1(sum.kcal * f),
      protein: round1(sum.protein * f),
      carbs: round1(sum.carbs * f),
      fat: round1(sum.fat * f),
    },
    portionGrams: servings && servings > 0 && baseGrams > 0 ? round1(baseGrams / servings) : null,
    weightWarning:
      cooked !== null && sum.grams > 0 && Math.abs(cooked - sum.grams) / sum.grams > COOKED_WEIGHT_WARNING_RATIO,
  };
}

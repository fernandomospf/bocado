/** Cálculo nutricional de receitas (função pura, sem banco). */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface IngredientValues extends Macros {
  /** Gramas crus do ingrediente; os macros são os desta quantidade. */
  grams: number;
}

export interface RecipeNutrition {
  totals: Macros;
  rawGrams: number;
  /** Peso de referência: peso final cozido, se informado; senão, a soma dos crus. */
  baseGrams: number;
  per100: Macros;
  /** Peso de uma porção (base / porções), se o rendimento foi informado. */
  portionGrams: number | null;
  /** Cozido difere mais de 50% do cru: vale conferir (aviso, não bloqueio). */
  weightWarning: boolean;
}

/** Diferença relativa entre peso cozido e cru a partir da qual a UI pede para conferir. */
export const COOKED_WEIGHT_WARNING_RATIO = 0.5;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function computeRecipe(
  ingredients: IngredientValues[],
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

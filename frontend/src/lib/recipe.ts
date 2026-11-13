import type { FoodResult, Macros, RecipeNutrition, RecipeSummary } from './types';

/** Receita no formato da busca de alimentos, para abrir o mesmo Sheet de porção. */
export function recipeToFood(r: RecipeSummary): FoodResult {
  return {
    id: r.id,
    name: r.name,
    origin: 'recipe',
    per100: r.per100,
    ...(r.portionGrams ? { portion: { grams: r.portionGrams, label: '1 porção' } } : {}),
    whole: { grams: r.baseGrams },
  };
}

/** Comparação de nomes sem acento e sem diferenciar maiúsculas (busca por nome). */
export function matchesName(name: string, query: string) {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const q = norm(query);
  return !q || q.split(/\s+/).every((w) => norm(name).includes(w));
}

/** "1 porção (325 g) · 491 kcal" ou "100 g · 151 kcal". */
export function recipeSubtitle(r: RecipeSummary) {
  const fmt = (n: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(n));
  if (r.portionGrams) return `1 porção (${fmt(r.portionGrams)} g) · ${fmt((r.per100.kcal * r.portionGrams) / 100)} kcal`;
  return `100 g · ${fmt(r.per100.kcal)} kcal`;
}

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

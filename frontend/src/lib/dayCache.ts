/**
 * Atualizações locais do resumo do dia (cache do SWR), para a interface reagir antes da resposta do servidor.
 * Sem imports de valor: roda também no teste com `node --test` (npm test).
 */
import type { DaySummary, Macros, MealItem } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Mesma regra do servidor: kcal inteira, macros com uma casa. */
export function sumMacros(items: Macros[]): Macros {
  const t = items.reduce(
    (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fat: acc.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

/**
 * Tira itens de uma refeição (ou a refeição inteira, sem `itemIds`) e recalcula os totais.
 * A refeição que fica vazia some, como no servidor.
 */
export function withoutItems(day: DaySummary, mealId: string, itemIds?: string[]): DaySummary {
  const drop = (i: MealItem) => !itemIds || itemIds.includes(i.id);
  const meals = day.meals.flatMap((m) => {
    if (m.id !== mealId) return [m];
    const items = m.items.filter((i) => !drop(i));
    return items.length ? [{ ...m, items, totals: sumMacros(items) }] : [];
  });
  return { ...day, meals, totals: sumMacros(meals.flatMap((m) => m.items)) };
}

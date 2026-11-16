import type { MealType } from '@prisma/client';
import { mealGroupKey } from '../suggestions/close-day.math';

export interface RecentItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  estimated: boolean;
}

export interface RecentMeal {
  /** A refeição mais recente do grupo: é ela que "Repetir" duplica. */
  mealId: string;
  type: MealType;
  date: string;
  /** Quantas vezes o mesmo conjunto aparece no período. */
  times: number;
  totals: { kcal: number; protein: number; carbs: number; fat: number };
  items: RecentItem[];
}

interface MealRow {
  id: string;
  type: MealType;
  date: Date;
  createdAt: Date;
  items: RecentItem[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Agrupa refeições iguais (mesmo conjunto de nome normalizado + gramas arredondadas, a mesma chave do "Para fechar o
 * dia") e devolve a mais recente de cada grupo. Com `type`, os grupos cuja refeição mais recente é desse tipo vêm
 * primeiro; depois os demais. Em cada bloco: mais frequentes antes, empate pela mais recente.
 * `meals` precisa vir da mais recente para a mais antiga.
 */
export function groupRecentMeals(meals: MealRow[], type: MealType | undefined, limit: number): RecentMeal[] {
  const groups = new Map<string, { latest: MealRow; times: number }>();
  for (const m of meals) {
    if (m.items.length === 0) continue;
    const key = mealGroupKey(m.items);
    const g = groups.get(key);
    if (g) g.times += 1;
    else groups.set(key, { latest: m, times: 1 });
  }

  const rank = (g: { latest: MealRow }) => (type && g.latest.type === type ? 0 : 1);
  const sorted = [...groups.values()].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.times - a.times ||
      b.latest.createdAt.getTime() - a.latest.createdAt.getTime(),
  );

  return sorted.slice(0, limit).map(({ latest, times }) => {
    const t = latest.items.reduce(
      (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fat: acc.fat + i.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    return {
      mealId: latest.id,
      type: latest.type,
      date: latest.date.toISOString().slice(0, 10),
      times,
      totals: { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) },
      items: latest.items,
    };
  });
}

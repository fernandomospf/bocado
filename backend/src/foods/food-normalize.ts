/**
 * Normalização de nomes de alimentos para busca e agrupamento:
 * minúsculas, sem acento, só letras/números separados por um espaço.
 * "Feijão, carioca, cozido" → "feijao carioca cozido".
 *
 * NORMALIZED_NAME_SQL faz o mesmo no Postgres (com unaccent), para agrupar meal_items no banco.
 */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Palavras que não ajudam a achar o alimento ("peito de frango" → peito, frango). */
const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'a', 'o', 'ao', 'um', 'uma']);

/** Palavras significativas da busca, já normalizadas (no máximo 6). */
export function searchTokens(query: string): string[] {
  const words = normalizeName(query).split(' ').filter(Boolean);
  const meaningful = words.filter((w) => !STOPWORDS.has(w));
  return (meaningful.length ? meaningful : words).slice(0, 6);
}

export const NORMALIZED_NAME_SQL = (column: string) =>
  `btrim(regexp_replace(lower(unaccent(${column})), '[^a-z0-9]+', ' ', 'g'))`;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** Converte os valores de uma porção para "por 100 g". Porção sem peso não tem como ser convertida. */
export function toPer100(grams: number, values: Macros): Macros | null {
  if (!(grams > 0)) return null;
  const f = 100 / grams;
  return {
    kcal: round1(values.kcal * f),
    protein: round1(values.protein * f),
    carbs: round1(values.carbs * f),
    fat: round1(values.fat * f),
  };
}

/** Valores de uma porção de `grams` gramas a partir dos valores por 100 g. */
export function fromPer100(per100: Macros, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: round1(per100.kcal * f),
    protein: round1(per100.protein * f),
    carbs: round1(per100.carbs * f),
    fat: round1(per100.fat * f),
  };
}

/** Alimento de uma refeição (valores da porção inteira). */
export interface SplitItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  estimated?: boolean;
  recipeId?: string;
}

const FIELDS = ['grams', 'kcal', 'protein', 'carbs', 'fat'] as const;

/**
 * Reparte um valor (em décimos, inteiro) entre as frações pelo método do maior resto:
 * cada pessoa leva o piso da sua cota e as sobras vão, uma a uma, a quem tem a maior parte fracionária
 * (empate: quem vem primeiro). A soma das partes é SEMPRE igual ao total.
 */
export function largestRemainder(totalTenths: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  const quotas = shares.map((s) => (totalTenths * s) / sum);
  const parts = quotas.map((q) => Math.floor(q + 1e-9));
  let left = totalTenths - parts.reduce((a, b) => a + b, 0);
  const order = quotas
    .map((q, i) => ({ i, frac: q - parts[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts;
}

/**
 * Divide os alimentos entre as pessoas. Devolve, por pessoa, a lista de alimentos já escalada.
 * Para cada alimento e cada campo (gramas, kcal e macros, com 1 casa decimal), a soma das cópias é exatamente o original.
 */
export function splitItems(items: SplitItem[], shares: number[]): SplitItem[][] {
  const out: SplitItem[][] = shares.map(() => []);
  for (const item of items) {
    const perField = FIELDS.map((f) => largestRemainder(Math.round(item[f] * 10), shares));
    shares.forEach((_, p) => {
      const copy: SplitItem = { ...item };
      FIELDS.forEach((f, k) => {
        copy[f] = perField[k][p] / 10;
      });
      out[p].push(copy);
    });
  }
  return out;
}

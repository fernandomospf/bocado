/** Prato por quilo (puro, sem React): limites do peso, soma das gramas e a frase de conferência com a balança. */

export const WEIGHT_MIN_G = 50;
export const WEIGHT_MAX_G = 3000;

/** "520" ou "520,5" → número; fora de 50 a 3000 g (ou vazio) → null. */
export function parseTotalGrams(raw: string): number | null {
  const n = Number(raw.trim().replace(',', '.'));
  if (!raw.trim() || !Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  return rounded >= WEIGHT_MIN_G && rounded <= WEIGHT_MAX_G ? rounded : null;
}

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
export const fmtG = (n: number) => `${nf.format(n)} g`;

/** Soma das gramas dos itens (a gordura de preparo, que não vem do prato pesado, fica de fora). */
export function sumGrams(items: { grams: number }[]): number {
  return Math.round(items.reduce((s, i) => s + (Number.isFinite(i.grams) ? i.grams : 0), 0) * 10) / 10;
}

/** "Total: 520 g, igual à balança" ou, depois de editar uma gramatura, "Agora 540 g de 520 g" (sem bloquear nada). */
export function byWeightLine(totalGrams: number, currentGrams: number): { text: string; matches: boolean } {
  const matches = Math.abs(currentGrams - totalGrams) < 0.05;
  return matches
    ? { text: `Total: ${fmtG(totalGrams)}, igual à balança`, matches }
    : { text: `Agora ${fmtG(currentGrams)} de ${fmtG(totalGrams)}`, matches };
}

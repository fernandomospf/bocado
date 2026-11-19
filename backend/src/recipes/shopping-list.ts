import { normalizeName } from '../foods/food-normalize';

/**
 * Lista de compras das receitas (pura, sem IA). Soma os ingredientes (crus) de cada receita vezes quantas vezes ela vai
 * ser preparada, por nome normalizado, arredonda a 10 g e agrupa pela categoria da TACO quando houver.
 *
 * PONTO DE EXTENSÃO (não implementado): integrar com um app externo de compras. A saída em `groups` é estável e simples
 * ({ category, items: [{ name, grams }] }); um conector futuro pode traduzi-la para o formato do app de destino a partir
 * deste mesmo resultado, sem mexer na soma nem no arredondamento.
 */

export const OTHER_CATEGORY = 'Outros';
export const MIN_TIMES = 1;
export const MAX_TIMES = 10;
const ROUND_TO_G = 10;

export interface ShoppingRecipe {
  times: number;
  ingredients: { name: string; grams: number; category: string | null }[];
}

export interface ShoppingItem {
  name: string;
  grams: number;
}

export interface ShoppingGroup {
  category: string;
  items: ShoppingItem[];
}

/** Arredonda a 10 g; nada que exista vira 0 (o mínimo é 10 g). */
export const roundGrams = (grams: number) => Math.max(ROUND_TO_G, Math.round(grams / ROUND_TO_G) * ROUND_TO_G);

export function buildShoppingList(recipes: ShoppingRecipe[]): ShoppingGroup[] {
  const byName = new Map<string, { name: string; grams: number; category: string | null }>();
  for (const recipe of recipes) {
    for (const ing of recipe.ingredients) {
      const key = normalizeName(ing.name);
      if (!key || !(ing.grams > 0)) continue;
      const entry = byName.get(key) ?? { name: ing.name.trim(), grams: 0, category: null };
      entry.grams += ing.grams * recipe.times;
      entry.category ??= ing.category;
      byName.set(key, entry);
    }
  }

  const groups = new Map<string, ShoppingItem[]>();
  for (const { name, grams, category } of byName.values()) {
    const cat = category?.trim() || OTHER_CATEGORY;
    groups.set(cat, [...(groups.get(cat) ?? []), { name, grams: roundGrams(grams) }]);
  }
  const collator = new Intl.Collator('pt-BR');
  return [...groups.entries()]
    .map(([category, items]) => ({ category, items: items.sort((a, b) => collator.compare(a.name, b.name)) }))
    // "Outros" sempre por último; as demais em ordem alfabética
    .sort((a, b) => (a.category === OTHER_CATEGORY ? 1 : b.category === OTHER_CATEGORY ? -1 : collator.compare(a.category, b.category)));
}

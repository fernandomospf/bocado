/**
 * Prato por quilo: o peso da balança é a verdade. A IA só diz a PROPORÇÃO entre os itens; aqui o servidor reescala as
 * gramas para somarem exatamente o total informado (kcal e macros acompanham), sem confiar na soma do modelo.
 *
 * A gordura de preparo (preparationFat) nunca é um item do resultado: é um palpite à parte, que o app transforma em
 * item depois e que fica FORA desta redistribuição (o peso da balança é o da comida servida).
 */

export const BY_WEIGHT_MIN_GRAMS = 50;
export const BY_WEIGHT_MAX_GRAMS = 3000;

export interface ScalableItem {
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Reescala `items` (mesma ordem, mesmos campos) para que a soma das gramas seja EXATAMENTE `totalGrams`.
 * Trabalha em décimos de grama (inteiros) e distribui as sobras pelo maior resto, então a soma não depende de ponto
 * flutuante. Itens com 0 g continuam com 0 g, a menos que todos estejam com 0 (aí o total é dividido igualmente).
 */
export function rescaleToTotal<T extends ScalableItem>(items: T[], totalGrams: number): T[] {
  if (items.length === 0) return [];
  const target = Math.round(totalGrams * 10);
  const weights = items.map((i) => Math.max(i.grams, 0));
  const equalSplit = weights.every((w) => w === 0);
  const basis = equalSplit ? weights.map(() => 1) : weights;
  const sum = basis.reduce((s, w) => s + w, 0);

  const exact = basis.map((w) => (w / sum) * target);
  const tenths = exact.map(Math.floor);
  let leftover = target - tenths.reduce((s, t) => s + t, 0);
  // Maior resto primeiro; empate pelo índice (resultado determinístico). Item de 0 g não recebe sobra.
  const order = exact
    .map((v, i) => ({ i, rest: v - Math.floor(v) }))
    .filter((o) => basis[o.i] > 0)
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  for (let k = 0; leftover > 0; k = (k + 1) % order.length, leftover--) tenths[order[k].i]++;

  return items.map((item, i) => {
    const grams = tenths[i] / 10;
    // Sem gramas de origem (divisão igual) não há fator: os valores do modelo ficam como estão
    const factor = item.grams > 0 ? grams / item.grams : 1;
    return {
      ...item,
      grams,
      kcal: round1(item.kcal * factor),
      protein: round1(item.protein * factor),
      carbs: round1(item.carbs * factor),
      fat: round1(item.fat * factor),
    };
  });
}

/** Linha acrescentada ao texto do usuário na análise por quilo. */
export function byWeightUserText(totalGrams: number, hint?: string): string {
  const base = `Estime os nutrientes desta refeição. Peso total do prato na balança: ${totalGrams} g (sem o prato). Distribua esse peso entre os itens.`;
  return hint ? `${base} Dica do usuário: ${hint}` : base;
}

/** Acrescentado ao prompt de sistema só no modo por quilo. */
export const BY_WEIGHT_PROMPT_ADDON = `

Prato por quilo (restaurante self-service brasileiro):
- O peso total do prato foi medido numa balança (sem o prato). Use-o como verdade: a soma das gramas dos itens deve ser igual a esse peso.
- Considere o que costuma estar no buffet por quilo: arroz, feijão, farofa, saladas, legumes, carnes grelhadas ou assadas, massas, frituras e molhos. Alimentos de baixa densidade (folhas, saladas) pesam pouco para o volume; carnes, feijão e massas pesam mais.
- Estime a proporção entre os itens pela área e pela altura de cada um no prato; as gramas absolutas serão ajustadas ao peso da balança depois.
- Pratos de restaurante costumam ter mais gordura de preparo do que os caseiros: informe isso em preparationFat, e não nos itens.`;

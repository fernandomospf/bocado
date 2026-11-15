/**
 * Gordura de preparo: a IA estima os alimentos SEM o óleo/manteiga/molho do preparo e dá um palpite à parte.
 * O usuário confirma com um toque e isso vira UM item no editor, substituído (nunca duplicado) a cada mudança.
 *
 * Lógica pura, sem React e sem imports de valor: roda também no teste com `node --test` (npm test).
 */
import type { DraftItem } from '../components/ItemsEditor';
import type { FatKind, FatLevel, FatRefKind, PreparationFatGuess, PreparationFatTable } from './types';

/** Marca do item de gordura dentro do editor. */
export const PREPARATION_FAT_KIND = 'preparationFat' as const;

export interface FatChoice {
  level: FatLevel;
  kind: FatRefKind;
}

export interface FatQuestionState {
  /** Último palpite da IA (mostrado em texto pequeno). */
  guess: PreparationFatGuess;
  /** O que está marcado nos chips. */
  choice: FatChoice;
  /** O usuário já tocou num chip: novas análises não sobrescrevem a escolha. */
  touched: boolean;
}

const KIND_LABEL: Record<FatRefKind, string> = { oil: 'óleo', butter: 'manteiga', sauce: 'molho' };

/** 'unknown' usa os valores de óleo (o preparo mais comum no Brasil). */
export const refKind = (kind: FatKind): FatRefKind => (kind === 'unknown' ? 'oil' : kind);

export const choiceFromGuess = (guess: PreparationFatGuess): FatChoice => ({
  level: guess.level,
  kind: refKind(guess.kind),
});

/**
 * Estado da pergunta depois de uma análise. Sem comida cozida, mantém a pergunta de uma análise anterior (se houver).
 * Com escolha manual, só o palpite exibido muda.
 */
export function nextFatState(
  prev: FatQuestionState | null,
  hasCookedFood: boolean,
  guess: PreparationFatGuess,
): FatQuestionState | null {
  if (!hasCookedFood) return prev;
  if (prev?.touched) return { guess, choice: prev.choice, touched: true };
  return { guess, choice: choiceFromGuess(guess), touched: false };
}

/** "A IA achou: um pouco de óleo". */
export function guessText(guess: PreparationFatGuess) {
  if (guess.level === 'none') return 'A IA achou: sem gordura no preparo';
  const amount = guess.level === 'little' ? 'um pouco de' : 'bastante';
  const what = guess.kind === 'unknown' ? 'gordura' : KIND_LABEL[guess.kind];
  return `A IA achou: ${amount} ${what}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const str = (n: number) => String(round1(n)).replace('.', ',');
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const isFatItem = (item: DraftItem) => item.kind === PREPARATION_FAT_KIND;

/**
 * Aplica a escolha à lista: remove o item de gordura com "Nada"; senão cria (no fim) ou atualiza no mesmo lugar,
 * mantendo a key para o React não remontar a linha. Qualquer duplicata antiga é descartada.
 */
export function applyFatChoice(items: DraftItem[], choice: FatChoice, table: PreparationFatTable): DraftItem[] {
  const existing = items.find(isFatItem);
  if (choice.level === 'none') return existing ? items.filter((i) => !isFatItem(i)) : items;

  const ref = table[choice.kind];
  const p = ref[choice.level];
  const fatItem: DraftItem = {
    key: existing?.key ?? uid(),
    name: `Gordura de preparo (${ref.label}, ${p.portion})`,
    grams: str(p.grams),
    kcal: str(p.kcal),
    protein: str(p.protein),
    carbs: str(p.carbs),
    fat: str(p.fat),
    base: { grams: p.grams, kcal: p.kcal, protein: p.protein, carbs: p.carbs, fat: p.fat },
    kind: PREPARATION_FAT_KIND,
    // Vem de valores de referência, não da IA: sem selo "estimativa"
    estimated: false,
  };

  if (!existing) return [...items, fatItem];
  let placed = false;
  return items.flatMap((i) => {
    if (!isFatItem(i)) return [i];
    if (placed) return [];
    placed = true;
    return [fatItem];
  });
}

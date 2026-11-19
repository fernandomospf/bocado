/**
 * Possíveis duplicados do acervo de produtos (OFF e LABEL). Regras puras; a consulta ao banco fica em AdminFoodsService.
 * Duplicado = mesmo código de barras (sem zeros à esquerda) OU nome + marca parecidos E valores por 100 g a até 5%.
 */

/** Similaridade mínima (pg_trgm) entre "nome + marca" normalizados. */
export const NAME_SIMILARITY_MIN = 0.8;
/** Diferença máxima relativa dos valores por 100 g. */
export const VALUE_TOLERANCE = 0.05;
/** Piso absoluto da tolerância (g ou kcal): valores minúsculos não viram "diferentes" por décimos. */
const ABS_FLOOR = 0.3;

export interface Per100 {
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(VALUE_TOLERANCE * Math.max(Math.abs(a), Math.abs(b)), ABS_FLOOR);

/** Os quatro valores por 100 g estão a até 5% um do outro? */
export function valuesClose(a: Per100, b: Per100): boolean {
  return close(a.kcal100, b.kcal100) && close(a.protein100, b.protein100) && close(a.carbs100, b.carbs100) && close(a.fat100, b.fat100);
}

/** Código sem zeros à esquerda: "0012345" e "12345" são o mesmo produto. Nulo/vazio = sem código. */
export function barcodeKey(code: string | null | undefined): string | null {
  const key = (code ?? '').replace(/^0+/, '');
  return key.length >= 6 ? key : null;
}

export interface Candidate extends Per100 {
  id: string;
  barcode: string | null;
}

export type DuplicateReason = 'barcode' | 'name';

export interface DuplicatePair {
  a: string;
  b: string;
  reason: DuplicateReason;
}

/** Une pares em grupos (componentes conexos): A~B e B~C viram um grupo {A, B, C}. */
export function clusterPairs(pairs: DuplicatePair[]): { ids: string[]; reasons: DuplicateReason[] }[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  for (const { a, b } of pairs) {
    parent.set(a, parent.get(a) ?? a);
    parent.set(b, parent.get(b) ?? b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, { ids: Set<string>; reasons: Set<DuplicateReason> }>();
  for (const { a, b, reason } of pairs) {
    const root = find(a);
    const g = groups.get(root) ?? { ids: new Set<string>(), reasons: new Set<DuplicateReason>() };
    g.ids.add(a);
    g.ids.add(b);
    g.reasons.add(reason);
    groups.set(root, g);
  }
  return [...groups.values()].map((g) => ({ ids: [...g.ids].sort(), reasons: [...g.reasons].sort() }));
}

/** Pares por código de barras (sem zeros à esquerda). */
export function barcodePairs(items: Candidate[]): DuplicatePair[] {
  const byKey = new Map<string, Candidate[]>();
  for (const it of items) {
    const key = barcodeKey(it.barcode);
    if (key) byKey.set(key, [...(byKey.get(key) ?? []), it]);
  }
  const pairs: DuplicatePair[] = [];
  for (const list of byKey.values()) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push({ a: list[i].id, b: list[j].id, reason: 'barcode' });
  }
  return pairs;
}

/**
 * "Para fechar o dia": quanto falta e o motor local de sugestões (sem IA).
 * Puro (sem banco nem rede), para ser testado isoladamente.
 *
 * Origem das sugestões, nesta ordem: refeições que a pessoa já comeu (escaladas) → modelos de pratos
 * brasileiros → (a pedido) IA. A porção de cada prato é resolvida numa ordem fixa: proteína primeiro,
 * depois os itens fixos (feijão, salada) e, por último, o carboidrato completa as kcal.
 */
import type { MealTemplate, SlotRole } from './meal-templates';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** De onde veio a sugestão (vira o selo na interface). */
export type SuggestionOrigin = 'history' | 'template' | 'pantry' | 'ai';

export interface SuggestionItem extends Macros {
  /** Nome natural (vai para a refeição registrada). */
  name: string;
  grams: number;
  /** Quantidade amigável para exibir: "150 g Peito de frango grelhado", "2 ovos fritos", "1 concha de feijão". */
  label: string;
}

export interface Suggestion {
  title: string;
  items: SuggestionItem[];
  totals: Macros;
  /** 0–1: quão perto chega do alvo. */
  fit: number;
  /** Atinge o critério mínimo (kcal ±15% e proteína ≥ 85%). */
  good: boolean;
  origin: 'local' | 'ai';
  mainOrigin: SuggestionOrigin;
  /** Famílias da proteína e do carboidrato principais (diversidade entre as opções). */
  proteinFamily?: string;
  carbFamily?: string;
  steps?: string[];
  minutes?: number | null;
}

/** Alimento já resolvido (TACO, histórico ou despensa), com valores por 100 g. */
export interface Food {
  name: string;
  per100: Macros;
  /** Medida caseira (TACO): ex.: 86 g "1 concha". */
  portionGrams?: number | null;
  portionLabel?: string | null;
}

/** Abaixo disso não vale sugerir uma refeição. */
export const MIN_REMAINING_KCAL = 150;
/** Uma refeição cobre no máximo esta fração da meta diária, mesmo que falte mais. */
export const MAX_MEAL_SHARE = 0.4;
/** Combinações que não cobrem ao menos isto da proteína que falta são descartadas. */
export const MIN_PROTEIN_COVERAGE = 0.7;
/** Para entrar entre as sugestões finais, a proteína precisa cobrir ao menos isto (mesmo critério de "boa"). */
export const PICK_PROTEIN_COVERAGE = 0.85;
/** ...e as kcal precisam ficar nesta faixa do alvo (uma batata cozida no teto não fecha um jantar de 800 kcal). */
export const PICK_KCAL_RANGE = { min: 0.75, max: 1.15 };
/** Faixa de proteína buscada pela porção do item proteico. */
export const PROTEIN_TARGET = { normal: 1, max: 1.1 };
/** Escala aceita ao reaproveitar uma refeição do histórico. */
export const HISTORY_SCALE = { min: 0.6, max: 1.6 };

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

// ---------------------------------------------------------------------------
// 1) Quanto falta
// ---------------------------------------------------------------------------

export function remaining(targets: Macros, totals: Macros): Macros {
  return {
    kcal: Math.max(0, Math.round(targets.kcal - totals.kcal)),
    protein: Math.max(0, round1(targets.protein - totals.protein)),
    carbs: Math.max(0, round1(targets.carbs - totals.carbs)),
    fat: Math.max(0, round1(targets.fat - totals.fat)),
  };
}

/** Dia fechado: meta de kcal batida, ou falta tão pouco que não cabe uma refeição. Não sugerir comer mais. */
export function isDayClosed(targets: Macros, totals: Macros): boolean {
  return totals.kcal >= targets.kcal || remaining(targets, totals).kcal < MIN_REMAINING_KCAL;
}

/** Alvo de UMA refeição: o que falta, limitado a 40% da meta de kcal, com macros proporcionais. */
export function mealTarget(rem: Macros, targets: Macros): Macros {
  const cap = Math.round(targets.kcal * MAX_MEAL_SHARE);
  if (rem.kcal <= cap) return rem;
  const f = cap / rem.kcal;
  return { kcal: cap, protein: round1(rem.protein * f), carbs: round1(rem.carbs * f), fat: round1(rem.fat * f) };
}

/** Proteína é prioridade quando é o maior déficit relativo (fração da meta que ainda falta). */
export function priorityOf(rem: Macros, targets: Macros): 'protein' | 'balanced' {
  const rel = (r: number, t: number) => (t > 0 ? r / t : 0);
  const p = rel(rem.protein, targets.protein);
  return p > 0 && p >= rel(rem.carbs, targets.carbs) && p >= rel(rem.fat, targets.fat) ? 'protein' : 'balanced';
}

// ---------------------------------------------------------------------------
// 2) Categorias: limites realistas de porção e famílias (diversidade)
// ---------------------------------------------------------------------------

export type FoodKind =
  | 'egg'
  | 'meat'
  | 'starch'
  | 'legume'
  | 'bread'
  | 'tapioca'
  | 'cheese'
  | 'dairy'
  | 'oats'
  | 'fruit'
  | 'veg'
  | 'other';

/** Limites em gramas por categoria (ovos em múltiplos de 50 g = 1 ovo). */
export const KIND_LIMITS: Record<FoodKind, { min: number; max: number; step: number }> = {
  egg: { min: 50, max: 200, step: 50 },
  meat: { min: 80, max: 250, step: 10 },
  starch: { min: 80, max: 250, step: 10 },
  legume: { min: 60, max: 200, step: 10 },
  bread: { min: 25, max: 100, step: 5 },
  tapioca: { min: 40, max: 100, step: 10 },
  cheese: { min: 20, max: 60, step: 10 },
  dairy: { min: 100, max: 300, step: 10 },
  oats: { min: 15, max: 40, step: 5 },
  fruit: { min: 80, max: 200, step: 10 },
  veg: { min: 50, max: 150, step: 10 },
  other: { min: 30, max: 400, step: 10 },
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const KIND_RULES: [FoodKind, RegExp][] = [
  ['egg', /\bovos?\b|omelete/],
  ['tapioca', /tapioca/],
  ['bread', /\bpao\b|\bpaes\b|torrada|sanduiche|bisnaga/],
  ['cheese', /queijo|requeijao/],
  ['dairy', /iogurte|\bleite\b|coalhada/],
  ['oats', /aveia|granola/],
  ['legume', /feijao|lentilha|grao-de-bico|ervilha/],
  ['starch', /arroz|macarrao|batata|mandioca|aipim|cuscuz|polenta|inhame|pure|nhoque/],
  [
    'meat',
    /frango|carne|patinho|acem|musculo|contrafile|contra-file|alcatra|maminha|picanha|bife|coxa|sobrecoxa|peixe|merluza|pescada|sardinha|atum|tilapia|salmao|file|linguica|porco|lombo|peru/,
  ],
  ['fruit', /banana|mamao|maca|laranja|morango|abacaxi|manga|pera|uva|melao|melancia|goiaba|kiwi|fruta/],
  [
    'veg',
    /alface|tomate|cenoura|brocolis|abobrinha|chuchu|couve|salada|legume|repolho|pepino|beterraba|vagem|espinafre|rucula|abobora/,
  ],
];

export function kindOf(name: string): FoodKind {
  const n = norm(name);
  return KIND_RULES.find(([, re]) => re.test(n))?.[0] ?? 'other';
}

const FAMILY_RULES: [string, RegExp][] = [
  ['frango', /frango/],
  ['carne', /carne|patinho|acem|musculo|contrafile|contra-file|alcatra|maminha|picanha|bife/],
  ['ovo', /\bovos?\b|omelete/],
  ['peixe', /peixe|merluza|pescada|tilapia|salmao/],
  ['sardinha', /sardinha/],
  ['atum', /atum/],
  ['iogurte', /iogurte/],
  ['queijo', /queijo/],
  ['batata-doce', /batata[- ]doce/],
  ['batata', /batata/],
  ['arroz', /arroz/],
  ['mandioca', /mandioca|aipim/],
  ['macarrao', /macarrao/],
  ['pao', /\bpao\b|\bpaes\b|sanduiche|torrada/],
  ['cuscuz', /cuscuz/],
  ['polenta', /polenta/],
  ['tapioca', /tapioca/],
  ['aveia', /aveia/],
  ['banana', /banana/],
  ['feijao', /feijao/],
  ['lentilha', /lentilha/],
];

/** Família do alimento: "Peito de frango grelhado" e "Coxa de frango" contam como a mesma proteína. */
export function familyOf(name: string): string {
  const n = norm(name);
  return FAMILY_RULES.find(([, re]) => re.test(n))?.[0] ?? n.split(/\s+/)[0];
}

function roundFor(kind: FoodKind, grams: number) {
  const { min, max, step } = KIND_LIMITS[kind];
  return clamp(Math.round(grams / step) * step, min, max);
}

// ---------------------------------------------------------------------------
// 3) Pontuação
// ---------------------------------------------------------------------------

/**
 * Erro relativo ponderado (menor é melhor): proteína 3, kcal 2, carboidrato 1, gordura 1.
 * Proteína acima do que falta pesa metade. Passar da kcal em mais de 10% leva penalidade forte.
 */
export function scoreTotals(t: Macros, rem: Macros): number {
  const relK = rem.kcal > 0 ? (t.kcal - rem.kcal) / rem.kcal : 0;
  const pBase = Math.max(rem.protein, 10);
  const pErr = t.protein >= rem.protein ? ((t.protein - rem.protein) / pBase) * 0.5 : (rem.protein - t.protein) / pBase;
  const cErr = Math.abs(t.carbs - rem.carbs) / Math.max(rem.carbs, 15);
  const fErr = Math.abs(t.fat - rem.fat) / Math.max(rem.fat, 8);
  let s = 3 * pErr + 2 * Math.abs(relK) + cErr + fErr;
  if (relK > 0.1) s += 2 + 10 * (relK - 0.1);
  return s;
}

/** Critério de "boa o suficiente": kcal dentro de ±15% do alvo E proteína com pelo menos 85% do alvo. */
export function isGoodEnough(t: Macros, rem: Macros): boolean {
  const kcalOk = rem.kcal > 0 && Math.abs(t.kcal - rem.kcal) / rem.kcal <= 0.15;
  return kcalOk && t.protein >= rem.protein * 0.85;
}

export function fitOf(t: Macros, rem: Macros): number {
  return Math.round(clamp(1 - scoreTotals(t, rem) / 4, 0, 1) * 100) / 100;
}

function macrosOf(f: Food, grams: number): Macros {
  const k = grams / 100;
  return { kcal: f.per100.kcal * k, protein: f.per100.protein * k, carbs: f.per100.carbs * k, fat: f.per100.fat * k };
}

function sum(list: Macros[]): Macros {
  return list.reduce(
    (t, m) => ({ kcal: t.kcal + m.kcal, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

function roundedTotals(items: Macros[]): Macros {
  const t = sum(items);
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

// ---------------------------------------------------------------------------
// 4) Quantidade amigável
// ---------------------------------------------------------------------------

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** "2 ovos fritos", "1 concha de feijão carioca cozido", "150 g Peito de frango grelhado". */
export function amountLabel(food: Food, grams: number): string {
  if (grams <= 0) return food.name;
  const kind = kindOf(food.name);
  if (kind === 'egg') {
    const n = Math.max(1, Math.round(grams / 50));
    const cooking = norm(food.name).match(/(cozid|frit|mexid)/)?.[1];
    const suffix = cooking ? ` ${cooking}${n > 1 ? 'os' : 'o'}` : '';
    return `${n} ${n > 1 ? 'ovos' : 'ovo'}${suffix}`;
  }
  const portion = food.portionGrams;
  const unit = food.portionLabel?.match(/^1\s+([a-zà-úç]+)$/i)?.[1];
  if (portion && unit && unit !== 'unidade') {
    const k = grams / portion;
    if (Math.abs(k - Math.round(k)) < 0.01 && Math.round(k) >= 1) {
      const n = Math.round(k);
      return `${n} ${unit}${n > 1 ? 's' : ''} de ${lowerFirst(food.name)}`;
    }
  }
  return `${Math.round(grams)} g ${food.name}`;
}

function toItem(food: Food, grams: number): SuggestionItem {
  const m = macrosOf(food, grams);
  return {
    name: food.name,
    grams: round1(grams),
    kcal: Math.round(m.kcal),
    protein: round1(m.protein),
    carbs: round1(m.carbs),
    fat: round1(m.fat),
    label: amountLabel(food, grams),
  };
}

// ---------------------------------------------------------------------------
// 5) Porções: proteína → fixos → carboidrato
// ---------------------------------------------------------------------------

export interface Slot {
  food: Food;
  role: SlotRole;
  /** fixed: gramas padrão; protein: teto opcional (ex.: "2 ovos" na despensa = até 100 g). */
  grams?: number;
}

/**
 * Resolve as porções de um prato, sem otimização numérica:
 * 1. proteína para cobrir ~100% da proteína que falta (descontada a dos itens fixos), dentro do limite da categoria;
 * 2. itens fixos na quantidade padrão (verduras 60–120 g, feijão 1 concha);
 * 3. o carboidrato completa a kcal restante, dentro do limite.
 * Gordura só a que vem dos alimentos (nenhum óleo é adicionado). Duas passadas: na segunda, a proteína do
 * carboidrato é descontada. Devolve null se a proteína não chegar a 70% dentro dos limites.
 */
export function solvePlate(slots: Slot[], rem: Macros): SuggestionItem[] | null {
  const protein = slots.find((s) => s.role === 'protein');
  const fill = slots.find((s) => s.role === 'fill');
  const fixedSlots = slots.filter((s) => s.role === 'fixed');
  if (!protein) return null;

  const fixedGrams = fixedSlots.map((s) => {
    const kind = kindOf(s.food.name);
    const g = s.grams ?? s.food.portionGrams ?? 100;
    // Verdura do modelo: fixa e leve (60–120 g). Medida caseira exata (1 concha) é mantida.
    if (kind === 'veg') return clamp(Math.round(g / 10) * 10, 60, 120);
    if (s.food.portionGrams && Math.abs(g - s.food.portionGrams) < 0.01) return g;
    return roundFor(kind, g);
  });
  const fixedMacros = sum(fixedSlots.map((s, i) => macrosOf(s.food, fixedGrams[i])));

  const pKind = kindOf(protein.food.name);
  const pLimits = KIND_LIMITS[pKind];
  const pMax = protein.grams ? Math.min(pLimits.max, protein.grams) : pLimits.max;
  const fillKind = fill ? kindOf(fill.food.name) : 'other';

  let pGrams = pLimits.min;
  let fillGrams = 0;
  let proteinShare = PROTEIN_TARGET.normal;
  for (let pass = 0; pass < 3; pass++) {
    const fillProtein = fill ? macrosOf(fill.food, fillGrams).protein : 0;
    const need = rem.protein * proteinShare - fixedMacros.protein - fillProtein;
    const raw = protein.food.per100.protein > 0 ? (need * 100) / protein.food.per100.protein : pLimits.min;
    pGrams = clamp(roundFor(pKind, raw), pLimits.min, pMax);
    if (fill && fill.food.per100.kcal > 0) {
      const kcalLeft = rem.kcal - macrosOf(protein.food, pGrams).kcal - fixedMacros.kcal;
      fillGrams = roundFor(fillKind, (Math.max(kcalLeft, 0) * 100) / fill.food.per100.kcal);
    }
    // Carboidrato no teto e ainda faltando kcal: usa a margem da proteína (até 110% do que falta)
    const fillAtMax = !fill || fillGrams >= KIND_LIMITS[fillKind].max;
    const kcalNow = macrosOf(protein.food, pGrams).kcal + fixedMacros.kcal + (fill ? macrosOf(fill.food, fillGrams).kcal : 0);
    if (pass === 1 && fillAtMax && kcalNow < rem.kcal * 0.9) proteinShare = PROTEIN_TARGET.max;
    else if (pass === 1) break;
  }

  const items = [
    toItem(protein.food, pGrams),
    ...(fill ? [toItem(fill.food, fillGrams)] : []),
    ...fixedSlots.map((s, i) => toItem(s.food, fixedGrams[i])),
  ];
  const totalProtein = items.reduce((t, i) => t + i.protein, 0);
  if (rem.protein >= 5 && totalProtein < rem.protein * MIN_PROTEIN_COVERAGE) return null;
  return items;
}

function plateSuggestion(
  title: string,
  items: SuggestionItem[],
  rem: Macros,
  mainOrigin: SuggestionOrigin,
  proteinName: string,
  carbName?: string,
): Suggestion {
  const totals = roundedTotals(items);
  return {
    title,
    items,
    totals,
    fit: fitOf(totals, rem),
    good: isGoodEnough(totals, rem),
    origin: 'local',
    mainOrigin,
    proteinFamily: familyOf(proteinName),
    carbFamily: carbName ? familyOf(carbName) : undefined,
  };
}

// ---------------------------------------------------------------------------
// 6) Origens: histórico, modelos e despensa
// ---------------------------------------------------------------------------

export interface HistoryMeal {
  items: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }[];
  /** Quantas vezes essa refeição (mesmos itens e gramas) foi registrada. */
  times: number;
}

/** Chave de agrupamento de refeições iguais: conjunto de (nome normalizado, gramas arredondadas a 10). */
export function mealGroupKey(items: { name: string; grams: number }[]): string {
  return items
    .map((i) => `${norm(i.name).replace(/[^a-z0-9]+/g, ' ').trim()}:${Math.round(i.grams / 10) * 10}`)
    .sort()
    .join('|');
}

/**
 * Reaproveita uma refeição que a pessoa já comeu: um fator de escala único (0,6–1,6) aproxima a kcal do alvo.
 * Só entra se, escalada, passar no critério "boa o suficiente".
 */
export function scaleHistoryMeal(meal: HistoryMeal, rem: Macros): Suggestion | null {
  const kcal = meal.items.reduce((t, i) => t + i.kcal, 0);
  if (kcal <= 0 || meal.items.length === 0) return null;
  const s = clamp(rem.kcal / kcal, HISTORY_SCALE.min, HISTORY_SCALE.max);

  const items: SuggestionItem[] = meal.items.map((i) => {
    if (i.grams <= 0) {
      // Item "só kcal": escala as kcal
      return {
        name: i.name,
        grams: 0,
        kcal: Math.round(i.kcal * s),
        protein: round1(i.protein * s),
        carbs: round1(i.carbs * s),
        fat: round1(i.fat * s),
        label: i.name,
      };
    }
    const kind = kindOf(i.name);
    const grams =
      kind === 'egg' ? Math.max(50, Math.round((i.grams * s) / 50) * 50) : Math.max(10, Math.round((i.grams * s) / 10) * 10);
    const f = grams / i.grams;
    const food: Food = {
      name: i.name,
      per100: {
        kcal: (i.kcal / i.grams) * 100,
        protein: (i.protein / i.grams) * 100,
        carbs: (i.carbs / i.grams) * 100,
        fat: (i.fat / i.grams) * 100,
      },
    };
    return {
      name: i.name,
      grams,
      kcal: Math.round(i.kcal * f),
      protein: round1(i.protein * f),
      carbs: round1(i.carbs * f),
      fat: round1(i.fat * f),
      label: amountLabel(food, grams),
    };
  });

  const totals = roundedTotals(items);
  if (!isGoodEnough(totals, rem)) return null;

  const byProtein = [...items].sort((a, b) => b.protein - a.protein)[0];
  const byCarbs = [...items].filter((i) => i !== byProtein).sort((a, b) => b.carbs - a.carbs)[0];
  return {
    title: historyTitle(items.map((i) => i.name)),
    items,
    totals,
    fit: fitOf(totals, rem),
    good: true,
    origin: 'local',
    mainOrigin: 'history',
    proteinFamily: familyOf(byProtein.name),
    carbFamily: byCarbs ? familyOf(byCarbs.name) : undefined,
  };
}

/** "Ovos mexidos com pão francês e café com leite" (no máximo 3 nomes). */
export function historyTitle(names: string[]): string {
  const [first, ...rest] = names.slice(0, 3);
  if (!rest.length) return first;
  const sides = rest.map(lowerFirst);
  return `${first} com ${sides.length === 1 ? sides[0] : `${sides[0]} e ${sides[1]}`}`;
}

export interface ResolvedTemplate {
  template: MealTemplate;
  slots: Slot[];
}

/** Modelos de pratos com as porções resolvidas para o alvo. */
export function templateSuggestions(templates: ResolvedTemplate[], rem: Macros): Suggestion[] {
  return templates.flatMap(({ template, slots }) => {
    const items = solvePlate(slots, rem);
    if (!items) return [];
    const protein = slots.find((s) => s.role === 'protein')!;
    const fill = slots.find((s) => s.role === 'fill');
    return [plateSuggestion(template.title, items, rem, 'template', protein.food.name, fill?.food.name)];
  });
}

/** Item da despensa: o termo digitado e quantas unidades (ex.: "2 ovos" → 2). */
export interface PantryTerm {
  term: string;
  quantity: number | null;
}

/** "frango, 2 ovos e arroz" → [frango, ovos (2), arroz]. Sem IA. */
export function parsePantry(text: string): PantryTerm[] {
  const seen = new Set<string>();
  return text
    .split(/[,;\n+]|\s+e\s+/i)
    .map((raw) => raw.trim().replace(/[.!?]+$/, ''))
    .filter(Boolean)
    .flatMap((raw) => {
      const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(?:x\s*)?(?:unidades?|un\.?|g|kg)?\s*(?:de\s+)?(.+)$/i);
      const term = (m ? m[2] : raw).trim().toLowerCase();
      const quantity = m ? Number(m[1].replace(',', '.')) : null;
      if (!term || term.length > 40 || seen.has(term)) return [];
      seen.add(term);
      return [{ term, quantity }];
    })
    .slice(0, 12);
}

const PROTEIN_KINDS = new Set<FoodKind>(['meat', 'egg', 'dairy', 'cheese']);
const CARB_KINDS = new Set<FoodKind>(['starch', 'bread', 'tapioca', 'fruit', 'oats']);

/**
 * Pratos montados só com o que a pessoa tem: cada proteína × cada carboidrato, com as verduras dela
 * (ou uma salada genérica, se nenhuma vier). Leguminosas entram como fixas quando há outro carboidrato.
 */
export function pantrySuggestions(
  foods: { food: Food; quantity: number | null }[],
  rem: Macros,
  defaultVeg: Food[],
): Suggestion[] {
  const proteins = foods.filter((f) => PROTEIN_KINDS.has(kindOf(f.food.name)));
  const carbs = foods.filter((f) => CARB_KINDS.has(kindOf(f.food.name)));
  const legumes = foods.filter((f) => kindOf(f.food.name) === 'legume');
  const vegs = foods.filter((f) => kindOf(f.food.name) === 'veg').slice(0, 2);
  const vegSlots: Slot[] = (vegs.length ? vegs.map((v) => v.food) : defaultVeg).map((food) => ({
    food,
    role: 'fixed',
    grams: 60,
  }));

  const out: Suggestion[] = [];
  const carbOptions = carbs.length ? carbs : legumes.length ? legumes : [null];
  for (const p of proteins) {
    for (const c of carbOptions) {
      const legumeSlots: Slot[] = carbs.length
        ? legumes.map((l) => ({ food: l.food, role: 'fixed' as const, grams: l.food.portionGrams ?? 86 }))
        : [];
      // "2 ovos" na despensa: no máximo 2 ovos no prato
      const cap = kindOf(p.food.name) === 'egg' && p.quantity ? p.quantity * 50 : undefined;
      const slots: Slot[] = [
        { food: p.food, role: 'protein', grams: cap },
        ...(c ? [{ food: c.food, role: 'fill' as const }] : []),
        ...legumeSlots,
        ...vegSlots,
      ];
      const items = solvePlate(slots, rem);
      if (!items) continue;
      const names = [p.food.name, ...(c ? [c.food.name] : []), ...legumeSlots.map((l) => l.food.name)];
      out.push(plateSuggestion(historyTitle(names), items, rem, 'pantry', p.food.name, c?.food.name));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 7) Seleção final: histórico primeiro, depois modelos; proteínas e carboidratos diferentes
// ---------------------------------------------------------------------------

/**
 * Até `limit` sugestões: o histórico na ordem recebida (por frequência), depois os demais pela pontuação,
 * exigindo família de proteína E de carboidrato diferentes entre as escolhidas, proteína ≥ 85% e kcal entre
 * 75% e 115% do alvo (melhor mostrar 2 boas opções do que 3 com uma fraca).
 * `familiar` (famílias que a pessoa costuma comer) desempata os modelos.
 */
export interface PickOptions {
  limit?: number;
  /** Famílias que a pessoa costuma comer (desempate dos modelos). */
  familiar?: Set<string>;
  /** Na despensa a pessoa pode ter um só carboidrato: aí basta variar a proteína. */
  distinctCarb?: boolean;
  /**
   * Exigir proteína ≥ 85% e kcal entre 75% e 115% do alvo. Na despensa fica desligado: a resposta é
   * "o melhor possível" com o que a pessoa tem (e a IA é oferecida se não for bom o suficiente).
   */
  strict?: boolean;
}

export function pickDiverse(history: Suggestion[], others: Suggestion[], rem: Macros, options: PickOptions = {}): Suggestion[] {
  const { limit = 3, familiar = new Set<string>(), distinctCarb = true, strict = true } = options;
  const rank = (s: Suggestion) => {
    const known = [s.proteinFamily, s.carbFamily].filter((f) => f && familiar.has(f)).length;
    return scoreTotals(s.totals, rem) - 0.15 * known;
  };
  const sortedOthers = [...others].sort((a, b) => Number(b.good) - Number(a.good) || rank(a) - rank(b));

  const usedProtein = new Set<string>();
  const usedCarb = new Set<string>();
  const picked: Suggestion[] = [];
  const acceptable = (s: Suggestion) => {
    if (!strict) return true;
    const proteinOk = rem.protein < 5 || s.totals.protein >= rem.protein * PICK_PROTEIN_COVERAGE;
    const ratio = rem.kcal > 0 ? s.totals.kcal / rem.kcal : 1;
    return proteinOk && ratio >= PICK_KCAL_RANGE.min && ratio <= PICK_KCAL_RANGE.max;
  };
  for (const s of [...history, ...sortedOthers]) {
    if (picked.length >= limit) break;
    if (!acceptable(s)) continue;
    if (s.proteinFamily && usedProtein.has(s.proteinFamily)) continue;
    if (distinctCarb && s.carbFamily && usedCarb.has(s.carbFamily)) continue;
    if (s.proteinFamily) usedProtein.add(s.proteinFamily);
    if (s.carbFamily) usedCarb.add(s.carbFamily);
    picked.push(s);
  }
  return picked;
}

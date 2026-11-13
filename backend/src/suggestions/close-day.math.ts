/**
 * "Para fechar o dia": quanto falta e o motor local de sugestões (sem IA).
 * Tudo aqui é puro (sem banco nem rede) para ser testado isoladamente.
 */

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type CandidateOrigin = 'history' | 'recipe' | 'taco';
export type FoodGroup = 'protein' | 'carb' | 'veg';

export interface Candidate {
  /** Identidade estável (dedupe e "alimento principal distinto"). */
  key: string;
  name: string;
  per100: Macros;
  origin: CandidateOrigin;
  /** Categoria TACO, quando houver (ajuda a separar verdura de tubérculo). */
  category?: string | null;
  /** Porção usual (histórico) ou medida caseira (TACO/receita), em gramas. */
  portionGrams?: number | null;
  /** Quantas vezes o usuário registrou (histórico e receitas). */
  timesUsed?: number;
}

export interface SuggestionItem extends Macros {
  name: string;
  grams: number;
  origin: CandidateOrigin | 'ai';
}

export interface Suggestion {
  title: string;
  items: SuggestionItem[];
  totals: Macros;
  /** 0–1: quão perto chega do que falta. */
  fit: number;
  /** Atinge o critério mínimo (kcal ±15% e proteína ≥ 85%). */
  good: boolean;
  origin: 'local' | 'ai';
  /** Origem do alimento principal, para o selo ("Do seu dia a dia", "TACO"). */
  mainOrigin: CandidateOrigin | 'ai';
  steps?: string[];
  minutes?: number | null;
}

/** Abaixo disso não vale sugerir uma refeição. */
export const MIN_REMAINING_KCAL = 150;
export const MAX_COMBINATIONS = 300;
export const GRAMS_STEP = 10;
export const MIN_GRAMS = 30;
export const MAX_GRAMS = 400;
/** Verdura acompanha: acima disso vira uma bacia de salada. */
export const MAX_VEG_GRAMS = 150;

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

/** Uma refeição cobre no máximo esta fração da meta diária, mesmo que falte mais (ex.: nada registrado até as 18h). */
export const MAX_MEAL_SHARE = 0.4;

/**
 * Alvo de UMA refeição: o que falta, limitado a 40% da meta de kcal do dia, com os macros reduzidos na
 * mesma proporção (a prioridade de proteína se mantém). Sugerir um jantar de 2.000 kcal não ajuda ninguém.
 */
export function mealTarget(rem: Macros, targets: Macros): Macros {
  const cap = Math.round(targets.kcal * MAX_MEAL_SHARE);
  if (rem.kcal <= cap) return rem;
  const f = cap / rem.kcal;
  return { kcal: cap, protein: round1(rem.protein * f), carbs: round1(rem.carbs * f), fat: round1(rem.fat * f) };
}

/** Dia fechado: meta de kcal batida, ou falta tão pouco que não cabe uma refeição. Não sugerir comer mais. */
export function isDayClosed(targets: Macros, totals: Macros): boolean {
  return totals.kcal >= targets.kcal || remaining(targets, totals).kcal < MIN_REMAINING_KCAL;
}

/** Proteína é prioridade quando é o maior déficit relativo (fração da meta que ainda falta). */
export function priorityOf(rem: Macros, targets: Macros): 'protein' | 'balanced' {
  const rel = (r: number, t: number) => (t > 0 ? r / t : 0);
  const p = rel(rem.protein, targets.protein);
  return p > 0 && p >= rel(rem.carbs, targets.carbs) && p >= rel(rem.fat, targets.fat) ? 'protein' : 'balanced';
}

// ---------------------------------------------------------------------------
// 2) Candidatos: o que é aceitável numa refeição, e em que grupo entra
// ---------------------------------------------------------------------------

/** Categorias TACO adequadas a uma refeição (sem bebidas, açúcares, temperos e óleos puros). */
export const MEAL_CATEGORIES = new Set([
  'Carnes e derivados',
  'Pescados e frutos do mar',
  'Ovos e derivados',
  'Leguminosas e derivados',
  'Cereais e derivados',
  'Verduras, hortaliças e derivados',
  'Leite e derivados',
]);

const RAW_OK = new Set(['Verduras, hortaliças e derivados', 'Leite e derivados']);
const TUBER = /\b(batata|mandioca|aipim|macaxeira|inhame|car[aá]|mandioquinha|baroa)\b/i;
const NOT_A_MEAL =
  /farinha|\bp[oó]\b|desidratad|biscoito|bolo|torrada|pipoca|cereal matinal|creme de|mingau|doce|condensad|achocolatad|sorvete|chantilly|pudim|\bsal\b/i;
const RAW = /\b(cru|crua|crus|cruas)\b/i;

/** Um item da TACO serve como sugestão de refeição? (cru só para verduras e laticínios) */
export function isMealFriendlyTaco(name: string, category: string | null | undefined): boolean {
  if (!category || !MEAL_CATEGORIES.has(category)) return false;
  if (NOT_A_MEAL.test(name)) return false;
  if (RAW.test(name) && !RAW_OK.has(category)) return false;
  return true;
}

/** Grupo pelo perfil de macros (funciona igual para TACO, histórico e receitas). */
export function classify(c: Pick<Candidate, 'name' | 'per100' | 'category'>): FoodGroup | null {
  const { kcal, protein, carbs } = c.per100;
  if (kcal <= 0) return null;
  const isVegetableCategory = c.category === 'Verduras, hortaliças e derivados';
  if (TUBER.test(c.name)) return carbs * 4 >= kcal * 0.5 ? 'carb' : null;
  if ((isVegetableCategory && kcal <= 60) || (!c.category && kcal <= 45 && protein * 4 < kcal * 0.3)) return 'veg';
  if (protein * 4 >= kcal * 0.3) return 'protein';
  if (carbs * 4 >= kcal * 0.5) return 'carb';
  return null;
}

const ORIGIN_BONUS: Record<CandidateOrigin, number> = { history: 1.35, recipe: 1.2, taco: 1 };

/**
 * Alimentos do dia a dia brasileiro (primeiro termo do nome na TACO). Sem isso, a densidade de proteína
 * pura escolhe peixes magros pouco comuns (corvina, abadejo) em vez de frango, carne e ovo.
 */
const COMMON =
  /^(frango|carne|ovo|til[aá]pia|merluza|sardinha|atum|pescada|peixe|queijo|iogurte|arroz|feij[aã]o|batata|mandioca|macarr[aã]o|p[aã]o|cuscuz|inhame|lentilha|gr[aã]o-de-bico|alface|tomate|cenoura|br[oó]colis|abobrinha|chuchu|couve|repolho|pepino|vagem|beterraba|ab[oó]bora|r[uú]cula|espinafre)\b/i;

/** Preferência: histórico > receitas > TACO, bônus por frequência de uso e por ser um alimento comum. */
function preference(c: Candidate) {
  const freq = 1 + 0.1 * Math.min(Math.log2(1 + (c.timesUsed ?? 0)), 4);
  const common = c.origin === 'taco' && COMMON.test(c.name.split(',')[0].trim()) ? 1.6 : 1;
  return ORIGIN_BONUS[c.origin] * freq * common;
}

/**
 * Densidade do macro que o grupo deve cobrir (g por kcal), limitada: acima do teto, "mais magro" não
 * ajuda (e deixa a refeição sem gordura); a partir daí decide a preferência.
 */
const DENSITY_CAP: Record<FoodGroup, number> = { protein: 0.12, carb: 0.18, veg: 1 };

function density(c: Candidate, group: FoodGroup) {
  const { kcal, protein, carbs } = c.per100;
  const raw = group === 'protein' ? protein / kcal : group === 'carb' ? carbs / kcal : 1 / (1 + kcal / 30);
  return Math.min(raw, DENSITY_CAP[group]);
}

const TOP = { protein: 8, carb: 6, veg: 4 } as const;

function topByGroup(candidates: Candidate[]) {
  const seen = new Set<string>();
  const groups: Record<FoodGroup, Candidate[]> = { protein: [], carb: [], veg: [] };
  for (const c of candidates) {
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    const g = classify(c);
    if (g) groups[g].push(c);
  }
  for (const g of Object.keys(groups) as FoodGroup[]) {
    groups[g].sort((a, b) => density(b, g) * preference(b) - density(a, g) * preference(a));
    groups[g] = groups[g].slice(0, TOP[g]);
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 3) Pontuação e porções
// ---------------------------------------------------------------------------

function itemMacros(c: Candidate, grams: number): Macros {
  const f = grams / 100;
  return { kcal: c.per100.kcal * f, protein: c.per100.protein * f, carbs: c.per100.carbs * f, fat: c.per100.fat * f };
}

function sum(list: Macros[]): Macros {
  return list.reduce(
    (t, m) => ({ kcal: t.kcal + m.kcal, protein: t.protein + m.protein, carbs: t.carbs + m.carbs, fat: t.fat + m.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

/**
 * Erro relativo ponderado (menor é melhor): proteína 3, kcal 2, carboidrato 1, gordura 1.
 * Proteína acima do que falta pesa metade. Passar da kcal restante em mais de 10% leva penalidade forte.
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

/** Critério de "boa o suficiente": kcal dentro de ±15% do que falta E proteína com pelo menos 85% do que falta. */
export function isGoodEnough(t: Macros, rem: Macros): boolean {
  const kcalOk = rem.kcal > 0 && Math.abs(t.kcal - rem.kcal) / rem.kcal <= 0.15;
  const proteinOk = t.protein >= rem.protein * 0.85;
  return kcalOk && proteinOk;
}

export function fitOf(t: Macros, rem: Macros): number {
  return Math.round(clamp(1 - scoreTotals(t, rem) / 4, 0, 1) * 100) / 100;
}

const maxFor = (c: Candidate) => (classify(c) === 'veg' ? MAX_VEG_GRAMS : MAX_GRAMS);
const snap10 = (g: number, max = MAX_GRAMS) => clamp(Math.round(g / GRAMS_STEP) * GRAMS_STEP, MIN_GRAMS, max);

/**
 * Porções em gramas que aproximam o que falta: palpite inicial + descida coordenada em passos de 40, 20 e 10 g
 * (mínimo 30 g, máximo 400 g; verduras até 150 g). Depois tenta trocar por múltiplos da porção caseira (½, 1, 1½, 2…) quando
 * isso quase não piora o resultado: "1 concha" é mais fácil de servir que "90 g".
 */
export function solvePortions(items: Candidate[], rem: Macros): number[] {
  const roleGuess = (c: Candidate, i: number): number => {
    const g = classify(c);
    if (g === 'veg') return c.portionGrams ?? 100;
    if (g === 'protein' && c.per100.protein > 0) return (rem.protein * 0.8 * 100) / c.per100.protein;
    // carboidrato: completa a kcal que sobra depois dos outros itens
    const others = items.filter((_, j) => j !== i).map((o) => itemMacros(o, classify(o) === 'veg' ? 100 : 120));
    const left = rem.kcal - sum(others).kcal;
    return c.per100.kcal > 0 ? (Math.max(left, 0) * 100) / c.per100.kcal : 100;
  };

  const max = items.map(maxFor);
  let grams = items.map((c, i) => snap10(roleGuess(c, i), max[i]));
  const score = (g: number[]) => scoreTotals(sum(items.map((c, i) => itemMacros(c, g[i]))), rem);
  let best = score(grams);

  for (const step of [40, 20, 10]) {
    for (let iter = 0; iter < 20; iter++) {
      let improved = false;
      for (let i = 0; i < items.length; i++) {
        for (const delta of [step, -step]) {
          const next = [...grams];
          next[i] = clamp(next[i] + delta, MIN_GRAMS, max[i]);
          const s = score(next);
          if (s < best - 1e-9) {
            best = s;
            grams = next;
            improved = true;
          }
        }
      }
      if (!improved) break;
    }
  }

  // Porções caseiras: aceita se piorar no máximo 5% (ou 0,02 em valor absoluto)
  items.forEach((c, i) => {
    const portion = c.portionGrams;
    if (!portion || portion <= 0) return;
    const half = portion / 2;
    const options = [Math.floor(grams[i] / half), Math.ceil(grams[i] / half)]
      .map((k) => Math.max(k, 1) * half)
      .filter((g) => g >= MIN_GRAMS && g <= max[i]);
    for (const g of options) {
      const next = [...grams];
      next[i] = round1(g);
      const s = score(next);
      if (s <= best * 1.05 + 0.02) {
        best = Math.min(best, s);
        grams = next;
        break;
      }
    }
  });

  return grams;
}

// ---------------------------------------------------------------------------
// 4) Combinações e resultado
// ---------------------------------------------------------------------------

const COOKING = /^(grelhad|cozid|assad|frit|refogad|ensopad|à milanesa)/i;

/** Substantivos femininos comuns na TACO que não terminam em "a". */
const FEMININE = /^(carne|costela|picanha|maminha|alcatra|fraldinha|tilápia|sardinha|merluza|pescada|corvina|lagosta)$|a$/i;

/** Concorda o preparo com o alimento: "Carne" + "cozido" → "Carne cozida". */
function agree(noun: string, cooking: string): string {
  return FEMININE.test(noun) ? cooking.replace(/o$/, 'a') : cooking.replace(/a$/, 'o');
}

/** "Frango, peito, sem pele, grelhado" → "Frango grelhado"; "Arroz, tipo 1, cozido" → "Arroz". */
export function shortName(name: string, withCooking: boolean): string {
  if (!name.includes(',')) return name.trim();
  const parts = name.split(',').map((p) => p.trim());
  const cook = withCooking ? parts.slice(1).find((p) => COOKING.test(p)) : undefined;
  return cook ? `${parts[0]} ${agree(parts[0], cook.split(/[/ ]/)[0])}` : parts[0];
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function titleFor(protein: Candidate, carb?: Candidate, veg?: Candidate): string {
  const main = shortName(protein.name, true);
  const sides = [carb, veg].filter((c): c is Candidate => !!c).map((c) => lowerFirst(shortName(c.name, false)));
  if (sides.length === 0) return main;
  if (sides.length === 1) return `${main} com ${sides[0]}`;
  return `${main} com ${sides[0]} e ${sides[1]}`;
}

export interface LocalResult {
  suggestions: Suggestion[];
  evaluated: number;
}

/**
 * Melhores combinações "proteína + carboidrato + verdura opcional" (2 ou 3 alimentos), avaliando no máximo
 * 300 combinações. Devolve até 3, cada uma com um alimento principal diferente.
 */
export function buildLocalSuggestions(rem: Macros, candidates: Candidate[], limit = 3): LocalResult {
  if (rem.kcal < MIN_REMAINING_KCAL) return { suggestions: [], evaluated: 0 };

  const groups = topByGroup(candidates);
  const needsCarb = rem.carbs >= 20;
  const combos: Candidate[][] = [];
  for (const p of groups.protein) {
    for (const c of groups.carb) {
      for (const v of groups.veg) combos.push([p, c, v]);
      combos.push([p, c]);
    }
    if (!needsCarb) for (const v of groups.veg) combos.push([p, v]);
  }

  const evaluated: { combo: Candidate[]; grams: number[]; totals: Macros; score: number }[] = [];
  for (const combo of combos.slice(0, MAX_COMBINATIONS)) {
    const grams = solvePortions(combo, rem);
    const totals = sum(combo.map((c, i) => itemMacros(c, grams[i])));
    evaluated.push({ combo, grams, totals, score: scoreTotals(totals, rem) });
  }
  evaluated.sort((a, b) => a.score - b.score);

  const usedMains = new Set<string>();
  const suggestions: Suggestion[] = [];
  for (const e of evaluated) {
    const main = e.combo[0];
    if (usedMains.has(main.key)) continue;
    usedMains.add(main.key);

    const carb = e.combo.find((c, i) => i > 0 && classify(c) === 'carb');
    const veg = e.combo.find((c, i) => i > 0 && classify(c) === 'veg');
    const items: SuggestionItem[] = e.combo.map((c, i) => {
      const m = itemMacros(c, e.grams[i]);
      return {
        name: c.name,
        grams: e.grams[i],
        kcal: Math.round(m.kcal),
        protein: round1(m.protein),
        carbs: round1(m.carbs),
        fat: round1(m.fat),
        origin: c.origin,
      };
    });
    const totals = sum(items);
    suggestions.push({
      title: titleFor(main, carb, veg),
      items,
      totals: { kcal: Math.round(totals.kcal), protein: round1(totals.protein), carbs: round1(totals.carbs), fat: round1(totals.fat) },
      fit: fitOf(totals, rem),
      good: isGoodEnough(totals, rem),
      origin: 'local',
      mainOrigin: main.origin,
    });
    if (suggestions.length >= limit) break;
  }

  return { suggestions, evaluated: evaluated.length };
}

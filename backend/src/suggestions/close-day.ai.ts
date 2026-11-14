import { parseLooseJson, toNumber } from '../analysis/analysis.parse';
import { fitOf, isGoodEnough, Macros, Suggestion, SuggestionItem } from './close-day.math';

const MAX_SUGGESTIONS = 2;
const MAX_ITEMS = 8;
const MAX_STEPS = 3;
/** Diferença tolerada entre a kcal declarada de um ingrediente e 4P + 4C + 9G. */
const KCAL_TOLERANCE = 0.25;

const round1 = (n: number) => Math.round(n * 10) / 10;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') {
    const parsed = parseLooseJson(v);
    return Array.isArray(parsed) ? parsed : [];
  }
  return [];
}

function pick(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] !== undefined) return obj[k];
  return undefined;
}

/**
 * Ingrediente da IA, validado: nome e gramas obrigatórios; macros não negativos; kcal recalculada pelos macros
 * quando a declarada destoa mais de 25% (não confiamos nos números do modelo).
 */
function coerceItem(raw: unknown): SuggestionItem | null {
  const item = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  if (!isRecord(item)) return null;
  const name = String(pick(item, ['name', 'nome']) ?? '').trim().slice(0, 120);
  const grams = Math.min(toNumber(pick(item, ['grams', 'gramas', 'quantidade'])), 1000);
  if (!name || !(grams > 0)) return null;

  const protein = toNumber(pick(item, ['protein', 'proteina', 'proteína']));
  const carbs = toNumber(pick(item, ['carbs', 'carboidratos']));
  const fat = toNumber(pick(item, ['fat', 'gordura']));
  const fromMacros = protein * 4 + carbs * 4 + fat * 9;
  let kcal = toNumber(pick(item, ['kcal', 'calorias']));
  if (fromMacros > 0 && (kcal <= 0 || Math.abs(kcal - fromMacros) / fromMacros > KCAL_TOLERANCE)) kcal = fromMacros;
  if (kcal <= 0) return null;

  const g = Math.round(grams);
  return {
    name,
    grams: g,
    kcal: Math.round(kcal),
    protein: round1(protein),
    carbs: round1(carbs),
    fat: round1(fat),
    label: `${g} g ${name}`,
  };
}

function coerceSteps(raw: unknown): string[] {
  const list = typeof raw === 'string' && !raw.trim().startsWith('[') ? raw.split(/\n+/) : asArray(raw);
  return list
    .map((s) => String(s).replace(/^\s*\d+[.)-]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, MAX_STEPS)
    .map((s) => s.slice(0, 200));
}

/**
 * Normaliza a resposta da ferramenta "sugerir_refeicao" e recalcula tudo no backend: totais pela soma dos
 * ingredientes validados, e fit/good pelo mesmo critério do motor local.
 */
export function coerceAiSuggestions(raw: unknown, rem: Macros): Suggestion[] {
  const obj = typeof raw === 'string' ? parseLooseJson(raw) : raw;
  const list = isRecord(obj) ? asArray(pick(obj, ['suggestions', 'sugestoes', 'sugestões'])) : asArray(obj);

  const out: Suggestion[] = [];
  for (const entry of list) {
    const s = typeof entry === 'string' ? parseLooseJson(entry) : entry;
    if (!isRecord(s)) continue;
    const items = asArray(pick(s, ['items', 'itens', 'ingredientes', 'ingredients']))
      .map(coerceItem)
      .filter((i): i is SuggestionItem => i !== null)
      .slice(0, MAX_ITEMS);
    if (items.length === 0) continue;

    const t = items.reduce(
      (acc, i) => ({ kcal: acc.kcal + i.kcal, protein: acc.protein + i.protein, carbs: acc.carbs + i.carbs, fat: acc.fat + i.fat }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const minutes = toNumber(pick(s, ['minutes', 'minutos', 'tempo']));
    out.push({
      title: String(pick(s, ['title', 'titulo', 'título']) ?? 'Sugestão').trim().slice(0, 100) || 'Sugestão',
      items,
      totals: { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) },
      fit: fitOf(t, rem),
      good: isGoodEnough(t, rem),
      origin: 'ai',
      mainOrigin: 'ai',
      steps: coerceSteps(pick(s, ['steps', 'passos', 'preparo', 'modoDePreparo'])),
      minutes: minutes > 0 ? Math.min(Math.round(minutes), 240) : null,
    });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/** Recalcula fit/good de sugestões (ex.: vindas do cache) contra o que falta para ESTE usuário agora. */
export function rescore(suggestions: Suggestion[], rem: Macros): Suggestion[] {
  return suggestions.map((s) => ({ ...s, fit: fitOf(s.totals, rem), good: isGoodEnough(s.totals, rem) }));
}

import { parseLooseJson, toNumber } from './analysis.parse';

/** Macros por 100 g (ou por porção, conforme o contexto). */
export interface LabelMacros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Rascunho do produto lido do rótulo: NÃO é salvo. Vai para a tela de revisão, e só a pessoa decide
 * gravar no acervo (POST /foods/products).
 */
export interface LabelDraft {
  barcode: string | null;
  name: string;
  brand: string | null;
  /** Sempre preenchido: lido da coluna de 100 g ou calculado a partir da porção. */
  per100: LabelMacros;
  serving: { grams: number; label: string } | null;
  /** O rótulo tinha a coluna de 100 g (false = calculamos pela porção). */
  per100Available: boolean;
  confidence: 'low' | 'medium' | 'high';
  /** Problemas que impedem salvar como está (kcal > 900, macros > 100 g, valores ausentes). */
  errors: string[];
  /** Avisos que não bloqueiam (kcal diferente de 4P + 4C + 9G). */
  warnings: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const asRecord = (v: unknown) => {
  const parsed = typeof v === 'string' ? parseLooseJson(v) : v;
  return isRecord(parsed) ? parsed : null;
};

function macros(v: unknown): LabelMacros | null {
  const m = asRecord(v);
  if (!m) return null;
  const out = {
    kcal: toNumber(m.kcal ?? m.calorias ?? m.energia),
    protein: toNumber(m.protein ?? m.proteina ?? m.proteinas),
    carbs: toNumber(m.carbs ?? m.carboidratos),
    fat: toNumber(m.fat ?? m.gordura ?? m.gorduras),
  };
  // Tudo zero = coluna ausente
  return out.kcal + out.protein + out.carbs + out.fat > 0 ? out : null;
}

/** Limites físicos de 100 g de alimento e coerência da energia com os macros. */
export function labelSanity(per100: LabelMacros): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (per100.kcal > 900) errors.push('Calorias acima de 900 kcal por 100 g: confira se não leu a coluna da porção ou o valor em kJ.');
  if (per100.protein + per100.carbs + per100.fat > 100) {
    errors.push('Proteína + carboidratos + gorduras passam de 100 g em 100 g de produto: confira os valores.');
  }
  if (per100.kcal <= 0) errors.push('Informe as calorias.');
  const fromMacros = per100.protein * 4 + per100.carbs * 4 + per100.fat * 9;
  if (per100.kcal > 0 && fromMacros > 0 && Math.abs(per100.kcal - fromMacros) / fromMacros > 0.2) {
    warnings.push(
      `As calorias (${round1(per100.kcal)} kcal) diferem mais de 20% do esperado pelos macros (${Math.round(fromMacros)} kcal). Confira a tabela.`,
    );
  }
  return { errors, warnings };
}

/**
 * Normaliza a resposta da ferramenta "registrar_produto". Sem a coluna de 100 g, calcula
 * per100 = perServing / porção × 100. Valores impossíveis viram erros (bloqueiam o salvamento até a revisão).
 */
export function coerceLabel(raw: unknown, barcode: string | null): LabelDraft {
  const obj = asRecord(raw) ?? {};
  const servingRaw = asRecord(obj.serving ?? obj.porcao);
  const servingGrams = servingRaw ? toNumber(servingRaw.grams ?? servingRaw.gramas) : 0;
  const servingLabel = servingRaw ? String(servingRaw.label ?? '').trim() : '';
  const serving = servingGrams > 0 && servingGrams <= 5000 ? { grams: round1(servingGrams), label: (servingLabel || `${round1(servingGrams)} g`).slice(0, 60) } : null;

  const read100 = macros(obj.per100 ?? obj.por100g);
  const perServing = macros(obj.perServing ?? obj.porPorcao);
  let per100: LabelMacros | null = read100;
  let per100Available = !!read100 && obj.per100Available !== false;
  if (!read100 && perServing && serving) {
    const f = 100 / serving.grams;
    per100 = { kcal: perServing.kcal * f, protein: perServing.protein * f, carbs: perServing.carbs * f, fat: perServing.fat * f };
    per100Available = false;
  }

  const values = per100 ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const rounded = { kcal: round1(values.kcal), protein: round1(values.protein), carbs: round1(values.carbs), fat: round1(values.fat) };
  const { errors, warnings } = labelSanity(rounded);
  if (!per100) errors.unshift('Não conseguimos ler os valores da tabela. Preencha à mão ou tire outra foto.');
  if (!read100 && per100) warnings.unshift('O rótulo só tinha os valores por porção: calculamos os de 100 g.');

  const confidence = obj.confidence === 'high' || obj.confidence === 'medium' ? obj.confidence : 'low';
  return {
    barcode,
    name: String(obj.name ?? obj.nome ?? '').trim().slice(0, 120),
    brand: String(obj.brand ?? obj.marca ?? '').trim().slice(0, 80) || null,
    per100: rounded,
    serving,
    per100Available,
    confidence,
    errors: [...new Set(errors)],
    warnings,
  };
}

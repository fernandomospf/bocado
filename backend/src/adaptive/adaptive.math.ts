import type { ActivityLevel, GoalType, Sex } from '@prisma/client';
import { parseDay } from '../common/dates';
import { ageFrom, calorieFloor, GOAL_KCAL_FACTOR, macroAnchor, rebalanceMacros, suggestTargets, type Targets } from '../profile/nutrition';
import { addDays, dayNumber, type WeightPoint } from '../weight/weight.math';

/**
 * Meta adaptativa: estima o gasto REAL a partir das calorias registradas e da variação do peso, e SUGERE um ajuste.
 * Tudo aqui é determinístico e sem banco. Datas locais "YYYY-MM-DD" enviadas pelo cliente (o servidor não usa fuso).
 */

export const WINDOW_DAYS = 28;
export const MIN_HISTORY_DAYS = 21;
export const MIN_DAILY_KCAL = 800;
export const MIN_DAILY_SHARE = 0.4;
export const MIN_WEIGHINS_PER_END = 2;
export const KCAL_PER_KG = 7700;
export const MAX_STEP_KCAL = 150;
export const MIN_SUGGEST_DIFF_KCAL = 100;
export const PAUSE_AFTER_DECISION_DAYS = 14;
export const MIN_ADULT_AGE = 18;
export const MIN_BMI_TO_LOSE = 18.5;
export const FAST_LOSS_SHARE_PER_WEEK = 0.01;
const TDEE_BMR_RANGE = { min: 1.0, max: 2.4 };
const MAX_FORMULA_DEVIATION = 0.35;
const CONFIDENCE_RULES = {
  HIGH: { usableDays: 24, weighIns: 10 },
  MEDIUM: { usableDays: 20, weighIns: 7 },
} as const;

export type AdaptiveState = 'disabled' | 'collecting' | 'no_change' | 'suggestion' | 'paused';
export type AdaptiveConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type AdaptiveNote = 'under18' | 'underweight_loss' | 'fast_loss' | 'low_intake';

export interface AdaptiveProfile {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
  targets: Targets;
}

export interface AdaptiveInput {
  today: string;
  enabled: boolean;
  /** Sem novas sugestões até esta data (exclusive: a partir dela já pode sugerir). */
  snoozedUntil: string | null;
  /** Dia da última decisão da pessoa (aplicou, manteve ou adiou). */
  lastDecisionDate: string | null;
  /** Primeiro dia com refeição registrada, em qualquer época. */
  firstMealDate: string | null;
  /** Total de kcal por dia, só dos dias que têm refeição com alimentos. */
  days: { date: string; kcal: number }[];
  weights: WeightPoint[];
  profile: AdaptiveProfile;
}

export interface AdaptiveProgress {
  usableDays: number;
  weighIns: number;
  daysSinceStart: number;
  needed: { daysSinceStart: number; usableDays: number; weighIns: number; weighInsPerEnd: number };
}

export interface AdaptiveEstimate {
  /** Gasto estimado pelos dados (bruto). */
  tdee: number;
  /** Gasto que a sugestão usa: a estimativa (confiança alta) ou a média com a fórmula (média). */
  usedTdee: number;
  confidence: AdaptiveConfidenceLevel;
  avgIntake: number;
  weightStartKg: number;
  weightEndKg: number;
  windowStart: string;
  windowEnd: string;
}

export interface AdaptiveSuggestion {
  currentKcal: number;
  newKcal: number;
  macros: Pick<Targets, 'protein' | 'carbs' | 'fat'>;
  formulaTdee: number;
}

export interface AdaptiveResult {
  state: AdaptiveState;
  progress: AdaptiveProgress;
  estimate?: AdaptiveEstimate;
  suggestion?: AdaptiveSuggestion;
  notes: AdaptiveNote[];
  snoozedUntil?: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round10 = (n: number) => Math.round(n / 10) * 10;
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/** Dia utilizável: tem refeição e pelo menos max(800, 40% da meta). Abaixo disso é registro incompleto (não conta como 0). */
export const usableThreshold = (targetKcal: number) => Math.max(MIN_DAILY_KCAL, targetKcal * MIN_DAILY_SHARE);

export function evaluateAdaptive(input: AdaptiveInput): AdaptiveResult {
  const { today, profile } = input;
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));
  const startNum = dayNumber(windowStart);
  const todayNum = dayNumber(today);
  const inWindow = (date: string) => {
    const n = dayNumber(date);
    return n >= startNum && n <= todayNum;
  };

  const threshold = usableThreshold(profile.targets.kcal);
  const usable = input.days.filter((d) => inWindow(d.date) && d.kcal >= threshold);
  const weights = input.weights.filter((w) => inWindow(w.date));
  const progress: AdaptiveProgress = {
    usableDays: usable.length,
    weighIns: weights.length,
    daysSinceStart: input.firstMealDate ? Math.max(0, todayNum - dayNumber(input.firstMealDate)) : 0,
    needed: {
      daysSinceStart: MIN_HISTORY_DAYS,
      usableDays: CONFIDENCE_RULES.MEDIUM.usableDays,
      weighIns: CONFIDENCE_RULES.MEDIUM.weighIns,
      weighInsPerEnd: MIN_WEIGHINS_PER_END,
    },
  };
  const result = (state: AdaptiveState, extra: Partial<AdaptiveResult> = {}): AdaptiveResult => ({
    state,
    progress,
    notes: [],
    ...extra,
  });

  // Travas de idade e preferência: o recurso fica desligado
  if (ageFrom(profile.birthDate, parseDay(today)) < MIN_ADULT_AGE) return result('disabled', { notes: ['under18'] });
  if (!input.enabled) return result('disabled');

  // Pausa depois de uma decisão (aplicar, manter ou adiar)
  const decisionPause =
    input.lastDecisionDate !== null && todayNum - dayNumber(input.lastDecisionDate) < PAUSE_AFTER_DECISION_DAYS;
  const snoozed = input.snoozedUntil !== null && input.snoozedUntil > today;
  if (snoozed || decisionPause) {
    return result('paused', input.snoozedUntil && snoozed ? { snoozedUntil: input.snoozedUntil } : {});
  }

  // Pontas da janela: dias 1 a 7 e 22 a 28, cada uma com pelo menos 2 pesagens
  const inRange = (w: WeightPoint, from: number, to: number) => {
    const n = dayNumber(w.date);
    return n >= from && n <= to;
  };
  const startGroup = weights.filter((w) => inRange(w, startNum, startNum + 6));
  const endGroup = weights.filter((w) => inRange(w, startNum + 21, startNum + 27));
  if (
    progress.daysSinceStart < MIN_HISTORY_DAYS ||
    startGroup.length < MIN_WEIGHINS_PER_END ||
    endGroup.length < MIN_WEIGHINS_PER_END
  ) {
    return result('collecting');
  }

  const startMean = mean(startGroup.map((w) => dayNumber(w.date)));
  const endMean = mean(endGroup.map((w) => dayNumber(w.date)));
  const weightStart = mean(startGroup.map((w) => w.weightKg));
  const weightEnd = mean(endGroup.map((w) => w.weightKg));

  // Ingestão média: só os dias utilizáveis ENTRE as datas médias das duas pontas
  const between = usable.filter((d) => {
    const n = dayNumber(d.date);
    return n >= startMean && n <= endMean;
  });
  if (between.length === 0) return result('collecting');
  const avgIntake = mean(between.map((d) => d.kcal));

  // Variação de peso por dia entre as datas médias; 1 kg de peso ≈ 7.700 kcal (aproximação usual, não exata:
  // depende da composição do que se ganha ou perde, e da água)
  const perDay = (weightEnd - weightStart) / (endMean - startMean);
  const dailyBalance = perDay * KCAL_PER_KG;
  const tdee = avgIntake - dailyBalance;

  // Confiança: quantidade de dados e plausibilidade do resultado
  const formula = suggestTargets({ ...profile, birthDate: profile.birthDate });
  let confidence: AdaptiveConfidenceLevel =
    usable.length >= CONFIDENCE_RULES.HIGH.usableDays && weights.length >= CONFIDENCE_RULES.HIGH.weighIns
      ? 'HIGH'
      : usable.length >= CONFIDENCE_RULES.MEDIUM.usableDays && weights.length >= CONFIDENCE_RULES.MEDIUM.weighIns
        ? 'MEDIUM'
        : 'LOW';
  const outOfRange = tdee < formula.bmr * TDEE_BMR_RANGE.min || tdee > formula.bmr * TDEE_BMR_RANGE.max;
  const farFromFormula = Math.abs(tdee - formula.tdee) / formula.tdee > MAX_FORMULA_DEVIATION;
  if (outOfRange || farFromFormula) confidence = 'LOW';
  if (confidence === 'LOW') return result('collecting'); // nunca uma sugestão, e nem a estimativa, com confiança baixa

  const usedTdee = confidence === 'HIGH' ? tdee : (tdee + formula.tdee) / 2;
  const estimate: AdaptiveEstimate = {
    tdee: Math.round(tdee),
    usedTdee: Math.round(usedTdee),
    confidence,
    avgIntake: Math.round(avgIntake),
    weightStartKg: round1(weightStart),
    weightEndKg: round1(weightEnd),
    windowStart,
    windowEnd: today,
  };

  // Notas de segurança (tom neutro no cliente)
  const floor = calorieFloor(profile.sex);
  const notes: AdaptiveNote[] = [];
  const heightM = profile.heightCm / 100;
  const underweight = weightEnd / (heightM * heightM) < MIN_BMI_TO_LOSE && profile.goal === 'LOSE';
  const weeklyLossKg = -perDay * 7;
  const fastLoss = weeklyLossKg > weightStart * FAST_LOSS_SHARE_PER_WEEK;
  const lowIntake = avgIntake < floor;
  if (underweight) notes.push('underweight_loss');
  if (fastLoss) notes.push('fast_loss');
  if (lowIntake) notes.push('low_intake');

  // Meta sugerida: gasto usado × fator do objetivo, no piso e com passo de no máximo 150 kcal
  const current = profile.targets.kcal;
  const wanted = Math.max(floor, round10(usedTdee * GOAL_KCAL_FACTOR[profile.goal]));
  const lo = Math.ceil((current - MAX_STEP_KCAL) / 10) * 10;
  const hi = Math.floor((current + MAX_STEP_KCAL) / 10) * 10;
  const next = Math.max(floor, Math.min(hi, Math.max(lo, wanted)));
  const diff = next - current;

  const blocked = underweight || (diff < 0 && (fastLoss || lowIntake)); // nunca reduzir mais nesses casos
  if (blocked || Math.abs(diff) < MIN_SUGGEST_DIFF_KCAL) return result('no_change', { estimate, notes });

  return result('suggestion', {
    estimate,
    notes,
    suggestion: {
      currentKcal: current,
      newKcal: next,
      macros: rebalanceMacros(next, macroAnchor(profile.targets)),
      formulaTdee: formula.tdee,
    },
  });
}

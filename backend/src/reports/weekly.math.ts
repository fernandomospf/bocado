import type { MealType, Sex, WeekStart } from '@prisma/client';
import { calorieFloor } from '../profile/nutrition';
import { addDays, dayNumber, summarizeTrend, type WeightPoint } from '../weight/weight.math';

/** Cálculos do relatório semanal, sem banco. Datas locais "YYYY-MM-DD" (o servidor não usa fuso). */

export const MIN_LOGGED_DAYS = 4;
export const KCAL_PER_KG = 7700;
const ON_TARGET_TOLERANCE = 0.1;
const PROTEIN_HIT = 0.9;
const MEAL_SHARE_NOTE = 0.45;
const PENDING_FROM_HOUR = 18;
const MIN_STREAK = 3;

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** 0 = domingo … 6 = sábado. */
export const weekdayOf = (date: string) => new Date(`${date}T00:00:00.000Z`).getUTCDay();

/** Primeiro dia da semana que contém `date` (equivalente a weekStart() de frontend/src/lib/date.ts). */
export function weekStartOf(date: string, weekStartsOn: WeekStart): string {
  const first = weekStartsOn === 'SUNDAY' ? 0 : 1;
  return addDays(date, -((weekdayOf(date) - first + 7) % 7));
}

export const weekEndOf = (start: string) => addDays(start, 6);

/**
 * Semana que deve ser destacada AGORA (só candidata: a regra de "ter registro" e a dispensa ficam fora).
 * - início no DOMINGO: a semana que terminou no sábado anterior, durante toda a semana corrente;
 * - início na SEGUNDA: no domingo, a partir das 18h, a semana corrente; nos demais momentos, a semana anterior
 *   (disponível até o fim da semana seguinte a ela).
 */
export function pendingWeekStart(today: string, hour: number, weekStartsOn: WeekStart): string {
  const current = weekStartOf(today, weekStartsOn);
  if (weekStartsOn === 'MONDAY' && weekdayOf(today) === 0 && hour >= PENDING_FROM_HOUR) return current;
  return addDays(current, -7);
}

// ---------------------------------------------------------------------------

export interface DayInput {
  date: string;
  /** Totais do dia; só existem se houve refeição com alimentos. */
  totals: Macros | null;
  /** kcal por tipo de refeição no dia. */
  byMeal: Partial<Record<MealType, number>>;
}

export interface ReportInput {
  weekStart: string;
  /** Um item por dia da semana com registro (os outros ficam de fora). */
  days: DayInput[];
  targets: Macros;
  tdee: number;
  sex: Sex;
  hideWeight: boolean;
  /** Pesos de (início − 14 dias) até o fim da semana. */
  weights: WeightPoint[];
}

export type Highlight =
  | { kind: 'topProtein'; date: string; protein: number }
  | { kind: 'mealShare'; mealType: MealType; share: number }
  | { kind: 'streak'; days: number };

export interface WeeklyDay {
  date: string;
  kcal: number;
  logged: boolean;
  goalKcal: number;
}

export type WeightNote = 'hidden' | 'needTwoThisWeek' | 'needPreviousWeek';

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  days: WeeklyDay[];
  loggedDays: number;
  insufficientData: boolean;
  /** Daqui para baixo, só com dados suficientes. */
  targets?: Macros;
  avg?: Macros;
  /** Soma de (meta − consumido) nos dias registrados. Positivo = abaixo da meta. */
  balanceVsTargetKcal?: number;
  /** Soma de (gasto estimado − consumido). `kg` é a estimativa (kcal / 7700); positivo = abaixo do gasto. Sem kg se o peso está oculto. */
  balanceVsExpenditure?: { kcal: number; kg: number | null; tdee: number };
  daysOnTarget?: number;
  daysProteinHit?: number;
  highlights?: Highlight[];
  weight?: {
    thisWeekKg: number;
    previousWeekKg: number;
    /** Medida: média desta semana − média da anterior. */
    measuredKg: number;
    /** Esperada pelo balanço estimado (negativo = abaixo), ou null sem balanço. */
    expectedKg: number | null;
  } | null;
  weightNote?: WeightNote | null;
  /** Média diária abaixo do piso de calorias das metas (1200 F / 1500 M). */
  lowIntakeNote?: boolean;
}

function longestStreak(dates: string[]): number {
  const sorted = [...dates].map(dayNumber).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  sorted.forEach((n, i) => {
    run = i > 0 && n - sorted[i - 1] === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export function buildWeeklyReport(input: ReportInput): WeeklyReport {
  const { weekStart, targets, tdee } = input;
  const byDate = new Map(input.days.filter((d) => d.totals).map((d) => [d.date, d]));
  const days: WeeklyDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const d = byDate.get(date);
    return { date, kcal: Math.round(d?.totals?.kcal ?? 0), logged: !!d, goalKcal: targets.kcal };
  });
  const logged = days.filter((d) => d.logged);
  const base = {
    weekStart,
    weekEnd: weekEndOf(weekStart),
    days,
    loggedDays: logged.length,
    insufficientData: logged.length < MIN_LOGGED_DAYS,
  };
  if (base.insufficientData) return base;

  // Dias sem registro nunca entram nas médias nem nos balanços (não contam como 0 kcal)
  const sums = logged.reduce(
    (a, d) => {
      const t = byDate.get(d.date)!.totals!;
      return { kcal: a.kcal + t.kcal, protein: a.protein + t.protein, carbs: a.carbs + t.carbs, fat: a.fat + t.fat };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const n = logged.length;
  const avg: Macros = { kcal: Math.round(sums.kcal / n), protein: round1(sums.protein / n), carbs: round1(sums.carbs / n), fat: round1(sums.fat / n) };

  const consumed = (date: string) => byDate.get(date)!.totals!;
  const balanceVsTargetKcal = Math.round(logged.reduce((s, d) => s + (targets.kcal - consumed(d.date).kcal), 0));
  const balanceKcal = Math.round(logged.reduce((s, d) => s + (tdee - consumed(d.date).kcal), 0));
  const daysOnTarget = logged.filter((d) => Math.abs(consumed(d.date).kcal - targets.kcal) <= targets.kcal * ON_TARGET_TOLERANCE).length;
  const daysProteinHit = logged.filter((d) => consumed(d.date).protein >= targets.protein * PROTEIN_HIT).length;

  // Destaques simples (no máximo 3, sem IA)
  const highlights: Highlight[] = [];
  const top = [...logged].sort((a, b) => consumed(b.date).protein - consumed(a.date).protein)[0];
  if (top) highlights.push({ kind: 'topProtein', date: top.date, protein: round1(consumed(top.date).protein) });
  const mealKcal = new Map<MealType, number>();
  for (const d of logged) for (const [type, k] of Object.entries(byDate.get(d.date)!.byMeal) as [MealType, number][]) mealKcal.set(type, (mealKcal.get(type) ?? 0) + k);
  const topMeal = [...mealKcal.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topMeal && sums.kcal > 0 && topMeal[1] / sums.kcal > MEAL_SHARE_NOTE) {
    highlights.push({ kind: 'mealShare', mealType: topMeal[0], share: Math.round((topMeal[1] / sums.kcal) * 100) / 100 });
  }
  const streak = longestStreak(logged.map((d) => d.date));
  if (streak >= MIN_STREAK) highlights.push({ kind: 'streak', days: streak });

  // Peso: média da semana contra a da anterior (summarizeTrend); só com 2+ registros na semana e 1+ na anterior
  const report: WeeklyReport = {
    ...base,
    targets,
    avg,
    balanceVsTargetKcal,
    balanceVsExpenditure: { kcal: balanceKcal, kg: input.hideWeight ? null : round1(balanceKcal / KCAL_PER_KG), tdee },
    daysOnTarget,
    daysProteinHit,
    highlights: highlights.slice(0, 3),
    lowIntakeNote: avg.kcal < calorieFloor(input.sex),
  };

  if (input.hideWeight) return { ...report, weight: null, weightNote: 'hidden' };

  const weekEnd = base.weekEnd;
  const prevStart = addDays(weekStart, -7);
  const prevEnd = addDays(weekStart, -1);
  const inWeek = input.weights.filter((w) => w.date >= weekStart && w.date <= weekEnd);
  const inPrev = input.weights.filter((w) => w.date >= prevStart && w.date <= prevEnd);
  if (inWeek.length < 2) return { ...report, weight: null, weightNote: 'needTwoThisWeek' };
  if (inPrev.length < 1) return { ...report, weight: null, weightNote: 'needPreviousWeek' };

  const thisKg = summarizeTrend(input.weights.filter((w) => w.date <= weekEnd)).trendKg!;
  const prevKg = summarizeTrend(input.weights.filter((w) => w.date <= prevEnd)).trendKg!;
  return {
    ...report,
    weight: {
      thisWeekKg: round1(thisKg),
      previousWeekKg: round1(prevKg),
      measuredKg: round1(thisKg - prevKg),
      expectedKg: round1(-balanceKcal / KCAL_PER_KG),
    },
    weightNote: null,
  };
}

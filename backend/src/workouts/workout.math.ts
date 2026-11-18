import type { WeekStart, WorkoutIntensity, WorkoutType } from '@prisma/client';
import { weekdayOf, weekEndOf, weekStartOf } from '../reports/weekly.math';
import { addDays, dayNumber } from '../weight/weight.math';

/**
 * Estimativa de gasto dos treinos. O treino é CONTEXTO do dia, não "calorias para comer": por padrão não mexe na
 * meta, e a estimativa é opcional e desligada. Sempre uma ESTIMATIVA aproximada, que pode errar bastante.
 *
 * Sem relação com a meta adaptativa (backend/src/adaptive): ela já capta o treino pela ingestão e pela variação de
 * peso, então o treino nunca entra no cálculo dela (nem aqui nem lá).
 */

export const MIN_DURATION_MIN = 5;
export const MAX_DURATION_MIN = 480;
/** O nível de atividade do questionário já inclui treino: só metade do gasto líquido pode entrar na meta do dia. */
export const GOAL_SHARE = 0.5;
export const GOAL_BONUS_CAP_KCAL = 600;

/**
 * MET de referência por tipo e intensidade, aproximados do Compêndio de Atividades Físicas
 * (Ainsworth et al., Compendium of Physical Activities, 2011 e atualização de 2024; https://pacompendium.com).
 * São médias de populações: o gasto real de cada pessoa varia muito.
 */
export const MET: Record<WorkoutType, Record<WorkoutIntensity, number>> = {
  STRENGTH: { LIGHT: 3.5, MODERATE: 5.0, HARD: 6.0 },
  RUN: { LIGHT: 7.0, MODERATE: 9.8, HARD: 11.8 },
  BIKE: { LIGHT: 4.0, MODERATE: 6.8, HARD: 10.0 },
  WALK: { LIGHT: 2.8, MODERATE: 3.5, HARD: 4.8 },
  OTHER: { LIGHT: 3.0, MODERATE: 5.0, HARD: 7.0 },
};

export interface WorkoutLike {
  type: WorkoutType;
  intensity: WorkoutIntensity;
  durationMin: number;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/** kcal brutas = MET × peso (kg) × horas. Inclui o gasto de repouso: não use para somar à meta. */
export function grossKcal(w: WorkoutLike, weightKg: number): number {
  return MET[w.type][w.intensity] * weightKg * (w.durationMin / 60);
}

/** kcal líquidas (acima do repouso) = (MET − 1) × peso × horas. É a que o app usa, para não contar o repouso de novo. */
export function netKcal(w: WorkoutLike, weightKg: number): number {
  return (MET[w.type][w.intensity] - 1) * weightKg * (w.durationMin / 60);
}

/** Estimativa de UM treino (líquida), arredondada a 10 kcal para não passar falsa precisão. */
export function estimateKcal(w: WorkoutLike, weightKg: number): number {
  return round10(netKcal(w, weightKg));
}

/** Bônus da meta do dia: 50% do gasto líquido total, arredondado a 10 kcal, com teto de 600 kcal por dia. */
export function goalBonusKcal(workouts: WorkoutLike[], weightKg: number): number {
  const net = workouts.reduce((s, w) => s + netKcal(w, weightKg), 0);
  return Math.min(GOAL_BONUS_CAP_KCAL, round10(net * GOAL_SHARE));
}

export interface WorkoutPrefs {
  workoutEstimateEnabled: boolean;
  workoutAddToGoal: boolean;
}

export interface DayWorkout {
  id: string;
  type: WorkoutType;
  durationMin: number;
  intensity: WorkoutIntensity;
  note: string | null;
  /** Só com a estimativa ligada. */
  estimateKcal?: number;
}

/** Treinos do dia como a tela Hoje os vê. A estimativa e o bônus só existem com as preferências ligadas. */
export function summarizeDayWorkouts(
  workouts: (WorkoutLike & { id: string; note?: string | null })[],
  weightKg: number,
  prefs: WorkoutPrefs,
): { workouts: DayWorkout[]; goalBonusKcal?: number } {
  const list = workouts.map((w) => ({
    id: w.id,
    type: w.type,
    durationMin: w.durationMin,
    intensity: w.intensity,
    note: w.note ?? null,
    ...(prefs.workoutEstimateEnabled ? { estimateKcal: estimateKcal(w, weightKg) } : {}),
  }));
  const bonus =
    prefs.workoutEstimateEnabled && prefs.workoutAddToGoal && workouts.length > 0
      ? goalBonusKcal(workouts, weightKg)
      : undefined;
  return { workouts: list, ...(bonus !== undefined ? { goalBonusKcal: bonus } : {}) };
}

export interface WorkoutWeekSummary {
  count: number;
  totalMinutes: number;
  byType: Partial<Record<WorkoutType, { count: number; minutes: number }>>;
}

export function summarizeWeek(workouts: Pick<WorkoutLike, 'type' | 'durationMin'>[]): WorkoutWeekSummary {
  const byType: WorkoutWeekSummary['byType'] = {};
  for (const w of workouts) {
    const cur = byType[w.type] ?? { count: 0, minutes: 0 };
    byType[w.type] = { count: cur.count + 1, minutes: cur.minutes + w.durationMin };
  }
  return { count: workouts.length, totalMinutes: workouts.reduce((s, w) => s + w.durationMin, 0), byType };
}

/** Meta DIÁRIA de movimento em minutos (15 a 240, de 5 em 5). Só referência: não altera metas de calorias nem de água. */
export const MOVEMENT_DAILY_MIN = 15;
export const MOVEMENT_DAILY_MAX = 240;
export const MOVEMENT_DAILY_DEFAULT = 30;
export const MOVEMENT_GOAL_STEP = 5;

/** Dias de descanso: 0 = domingo … 6 = sábado. */
export const isRestDay = (date: string, restDays: readonly number[]) => restDays.includes(weekdayOf(date));

export interface MovementDay {
  minutes: number;
  /** Meta diária do perfil; nula sem meta (menores de 18 até definirem a sua). Vale também em dia de descanso. */
  goalMin: number | null;
  /** O dia da semana está entre os dias de descanso escolhidos. */
  restDay: boolean;
  /** minutes >= goalMin, fora de dia de descanso. */
  reached: boolean;
  /** Soma das estimativas líquidas dos treinos do dia; nula sem a preferência, com "esconder calorias" ou sem treino. */
  estimateKcal: number | null;
}

/** Movimento de UM dia (data local "YYYY-MM-DD"; o dia da semana sai da própria data, sem fuso). */
export function summarizeMovementDay(input: {
  workouts: WorkoutLike[];
  date: string;
  goalMin: number | null;
  restDays: readonly number[];
  weightKg: number;
  showEstimate: boolean;
}): MovementDay {
  const minutes = input.workouts.reduce((s, w) => s + w.durationMin, 0);
  const restDay = isRestDay(input.date, input.restDays);
  return {
    minutes,
    goalMin: input.goalMin,
    restDay,
    reached: !restDay && input.goalMin !== null && minutes >= input.goalMin,
    estimateKcal: input.showEstimate && input.workouts.length > 0 ? input.workouts.reduce((s, w) => s + estimateKcal(w, input.weightKg), 0) : null,
  };
}

export interface MovementWeek {
  weekStart: string;
  weekEnd: string;
  /** @deprecated A meta semanal saiu: sempre nulo (a meta agora é diária, em `dailyGoalMin`). */
  goalMin: null;
  doneMin: number;
  workoutsCount: number;
  /** @deprecated Sem meta semanal: sempre falso. Use `daysReached` / `activeDays`. */
  reached: boolean;
  /** @deprecated Sem meta semanal: sempre nulo. */
  remainingMin: null;
  /** Dias que ainda restam na semana, contando o próprio dia de `today` (0 se a semana já passou). */
  daysLeft: number;
  byDay: { date: string; minutes: number; count: number; restDay: boolean; reached: boolean }[];
  /** Soma das estimativas líquidas; nulo sem a preferência ligada ou com "esconder calorias". */
  estimateKcal: number | null;
  /** Meta diária do perfil (nula sem meta). */
  dailyGoalMin: number | null;
  /** 7 menos os dias de descanso. */
  activeDays: number;
  /** Dias ativos da semana com a meta diária batida; nulo sem meta. */
  daysReached: number | null;
}

/** Resumo da semana de movimento (datas locais "YYYY-MM-DD"). O treino é contexto: a meta é só referência. */
export function summarizeMovementWeek(input: {
  workouts: (WorkoutLike & { date: string })[];
  today: string;
  weekStartsOn: WeekStart;
  dailyGoalMin: number | null;
  restDays: readonly number[];
  weightKg: number;
  showEstimate: boolean;
}): MovementWeek {
  const weekStart = weekStartOf(input.today, input.weekStartsOn);
  const weekEnd = weekEndOf(weekStart);
  const inWeek = input.workouts.filter((w) => w.date >= weekStart && w.date <= weekEnd);
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const day = inWeek.filter((w) => w.date === date);
    const m = summarizeMovementDay({ workouts: day, date, goalMin: input.dailyGoalMin, restDays: input.restDays, weightKg: 0, showEstimate: false });
    return { date, minutes: m.minutes, count: day.length, restDay: m.restDay, reached: m.reached };
  });
  const restCount = new Set(input.restDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)).size;
  return {
    weekStart,
    weekEnd,
    goalMin: null,
    doneMin: byDay.reduce((s, d) => s + d.minutes, 0),
    workoutsCount: inWeek.length,
    reached: false,
    remainingMin: null,
    daysLeft: Math.max(0, Math.min(7, dayNumber(weekEnd) - dayNumber(input.today) + 1)),
    byDay,
    estimateKcal: input.showEstimate ? inWeek.reduce((s, w) => s + estimateKcal(w, input.weightKg), 0) : null,
    dailyGoalMin: input.dailyGoalMin,
    activeDays: 7 - restCount,
    daysReached: input.dailyGoalMin === null ? null : byDay.filter((d) => d.reached).length,
  };
}

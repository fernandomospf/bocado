import type { WorkoutIntensity, WorkoutType } from '@prisma/client';

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

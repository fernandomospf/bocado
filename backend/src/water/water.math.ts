/**
 * Meta diária de água. São REFERÊNCIAS PRÁTICAS GERAIS (não prescrição): a necessidade real varia com clima, saúde,
 * alimentação e orientação médica. Por isso o app deixa desligar o contador e definir a própria meta.
 */
export const WATER_ML_PER_KG = 35;
export const WORKOUT_ML_PER_MIN = 10;
export const WORKOUT_MAX_EXTRA_ML = 1000;
export const WATER_MIN_GOAL_ML = 1500;
export const WATER_MAX_GOAL_ML = 4000;
export const WATER_STEP_ML = 50;
/** Diferença mínima para atualizar a meta de HOJE (evita ficar mudando à toa). */
export const WATER_RECALC_MIN_DIFF_ML = 100;

export const MANUAL_MIN_ML = 1000;
export const MANUAL_MAX_ML = 5000;
export const BOTTLE_MIN_ML = 100;
export const BOTTLE_MAX_ML = 2000;
export const ENTRY_MIN_ML = 50;
export const ENTRY_MAX_ML = 2000;
/** Limite de segurança do total de um dia (evita digitação errada). */
export const DAY_MAX_ML = 8000;

export const roundTo = (n: number, step: number) => Math.round(n / step) * step;

export interface WaterGoal {
  goalMl: number;
  baseMl: number;
  workoutMl: number;
}

/**
 * base = 35 ml por kg (peso = tendência de 7 dias); treino do dia: + 10 ml por minuto, no máximo + 1000 ml;
 * total limitado entre 1500 e 4000 ml e arredondado a 50 ml.
 */
export function computeWaterGoal(input: { weightKg: number; workoutMinutes: number }): WaterGoal {
  const baseMl = Math.round(WATER_ML_PER_KG * input.weightKg);
  const workoutMl = Math.min(Math.max(0, Math.round(input.workoutMinutes)) * WORKOUT_ML_PER_MIN, WORKOUT_MAX_EXTRA_ML);
  const clamped = Math.min(Math.max(baseMl + workoutMl, WATER_MIN_GOAL_ML), WATER_MAX_GOAL_ML);
  return { goalMl: roundTo(clamped, WATER_STEP_ML), baseMl, workoutMl };
}

/** Dia batido = total >= meta do PRÓPRIO dia. */
export const goalReached = (totalMl: number, goalMl: number | null) => goalMl !== null && goalMl > 0 && totalMl >= goalMl;

/**
 * Sequência de dias batidos, em datas locais "YYYY-MM-DD".
 * current: termina hoje (se hoje já bateu) ou ontem (se hoje ainda não bateu); best: a maior sequência da janela.
 */
export function computeStreak(days: { date: string; reached: boolean }[], today: string): { current: number; best: number } {
  const dn = (iso: string) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000);
  const hit = new Set(days.filter((d) => d.reached).map((d) => dn(d.date)));
  let cursor = dn(today);
  if (!hit.has(cursor)) cursor -= 1;
  let current = 0;
  while (hit.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const d of [...hit].sort((a, b) => a - b)) {
    run = prev !== null && d === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

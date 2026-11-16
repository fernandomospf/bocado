/** Lógica do contador de água no app (pura, sem React): status, formatação e pontinhos da semana. */

export const QUICK_ML = [150, 200, 300, 500] as const;
export const DEFAULT_QUICK_ML = 200;
export const LAST_ML_KEY = 'bocado:water:lastMl';
/** Passou disso, o aviso é "não precisa forçar". */
export const OVER_GOAL_RATIO = 1.5;

const nf = new Intl.NumberFormat('pt-BR');
export const fmtMl = (n: number) => nf.format(Math.round(n));

/** Fração esperada do dia: 0 às 7h, 1 às 21h, linear entre as duas. */
export function expectedFraction(hour: number): number {
  if (hour <= 7) return 0;
  if (hour >= 21) return 1;
  return (hour - 7) / 14;
}

export type WaterStatus = 'done' | 'onTrack' | 'nudge' | 'plain';

export const STATUS_LABEL: Record<Exclude<WaterStatus, 'plain'>, string> = {
  done: 'Meta batida',
  onTrack: 'No ritmo',
  nudge: "Hora de um copo d'água",
};

/**
 * Status do dia, com a hora LOCAL. "Meta batida" vale a qualquer hora; "No ritmo" e "Hora de um copo d'água" só entre 8h
 * e 21h (fora disso, só o progresso). "No ritmo" = progresso >= fração esperada do horário - 15 pontos percentuais.
 */
export function waterStatus(input: { totalMl: number; goalMl: number | null; hour: number; minute?: number }): WaterStatus {
  const { totalMl, goalMl } = input;
  if (goalMl === null || goalMl <= 0) return 'plain';
  if (totalMl >= goalMl) return 'done';
  const h = input.hour + (input.minute ?? 0) / 60;
  if (h < 8 || h >= 21) return 'plain';
  return totalMl / goalMl >= expectedFraction(h) - 0.15 ? 'onTrack' : 'nudge';
}

export const progressRatio = (totalMl: number, goalMl: number | null) => (goalMl && goalMl > 0 ? totalMl / goalMl : 0);
export const isWellOver = (totalMl: number, goalMl: number | null) => goalMl !== null && goalMl > 0 && totalMl > goalMl * OVER_GOAL_RATIO;

export type DotState = 'hit' | 'partial' | 'none';

/** Pontinho da semana: dia batido, parcial (algum registro) ou sem registro. Sempre tons neutros. */
export function dotState(day: { totalMl: number; goalMl: number | null } | undefined): DotState {
  if (!day || day.totalMl <= 0) return 'none';
  return day.goalMl !== null && day.totalMl >= day.goalMl ? 'hit' : 'partial';
}

export const DOT_LABEL: Record<DotState, string> = { hit: 'meta batida', partial: 'registro parcial', none: 'sem registro' };

/** O último valor usado (ou 200 ml). */
export function readLastMl(storage: Pick<Storage, 'getItem'> | undefined): number {
  try {
    const n = Number(storage?.getItem(LAST_ML_KEY));
    return Number.isInteger(n) && n >= 50 && n <= 2000 ? n : DEFAULT_QUICK_ML;
  } catch {
    return DEFAULT_QUICK_ML;
  }
}

export const goalToastKey = (date: string) => `bocado:water:goalToast:${date}`;

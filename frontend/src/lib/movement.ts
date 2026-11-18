/**
 * Movimento da semana e Home (puro, testável): estado da chama, passo da meta, cabeçalhos dos dropdowns e
 * estado aberto/fechado guardado no aparelho. Tom sem culpa (lib/tone.md): nenhuma cobrança, nenhum julgamento.
 * Roda com: npm test (movement.test.mjs)
 */

export const MOVEMENT_GOAL_MIN = 30;
export const MOVEMENT_GOAL_MAX = 600;
export const MOVEMENT_GOAL_STEP = 15;
export const MOVEMENT_GOAL_DEFAULT = 150;
/** Duração da chama viajando na ponta do arco. */
export const FLAME_TRAVEL_MS = 1400;

/** Valor anterior do medidor (a Home grava a cada desenho; vale também ao voltar de outra rota). */
export const moveFromKey = (weekStart: string) => `bocado:moveFrom:${weekStart}`;
/** Toast + vibração da meta batida: uma vez por semana. */
export const moveGoalToastKey = (weekStart: string) => `bocado:moveGoal:${weekStart}`;

/** Próxima meta no stepper (de 15 em 15, entre 30 e 600). Valores fora do passo encaixam no próximo múltiplo. */
export function stepGoal(current: number | null, direction: 1 | -1): number {
  const base = current ?? MOVEMENT_GOAL_DEFAULT;
  const next = direction > 0 ? Math.floor(base / MOVEMENT_GOAL_STEP) * MOVEMENT_GOAL_STEP + MOVEMENT_GOAL_STEP : Math.ceil(base / MOVEMENT_GOAL_STEP) * MOVEMENT_GOAL_STEP - MOVEMENT_GOAL_STEP;
  return Math.min(MOVEMENT_GOAL_MAX, Math.max(MOVEMENT_GOAL_MIN, next));
}

export type FlameState = 'off' | 'burning' | 'lit';

/**
 * "Apagada" sem nada na semana; "queimando" entre 0 e 100% (a cor esquenta de forma contínua com `heat`); "acesa" só
 * quando a meta da semana fecha. Sem meta: queimando com os minutos, mas nunca "acesa".
 */
export function flameState(doneMin: number, goalMin: number | null): { state: FlameState; heat: number } {
  if (doneMin <= 0) return { state: 'off', heat: 0 };
  if (goalMin === null || goalMin <= 0) return { state: 'burning', heat: 0.6 };
  if (doneMin >= goalMin) return { state: 'lit', heat: 1 };
  return { state: 'burning', heat: Math.min(1, Math.max(0.15, doneMin / goalMin)) };
}

/** Desaceleração do fim do trajeto (ease-out cúbico). */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

// ---------------------------------------------------------------------------
// Cabeçalhos dos dropdowns
// ---------------------------------------------------------------------------

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const n0 = (n: number) => int.format(Math.round(n));
const plural = (n: number, one: string, many: string) => `${n0(n)} ${n === 1 ? one : many}`;

/** Resumo à direita de "Refeições": "4 itens · 1.591 kcal" (sem calorias: "4 itens · P 167 g"). Sem itens: vazio. */
export function mealsSummary(input: { items: number; kcal: number; protein: number; hideCalories: boolean }): string {
  if (input.items === 0) return '';
  const tail = input.hideCalories ? `P ${n0(input.protein)} g` : `${n0(input.kcal)} kcal`;
  return `${plural(input.items, 'item', 'itens')} · ${tail}`;
}

/** Resumo à direita de "Atividades": "1 treino · 60 min · ≈ 280 kcal (estimativa)"; sem treino, "nenhum treino hoje". */
export function activitiesSummary(input: {
  workouts: { durationMin: number; estimateKcal?: number }[];
  hideCalories: boolean;
  isToday: boolean;
}): string {
  const { workouts, hideCalories } = input;
  if (workouts.length === 0) return `nenhum treino ${input.isToday ? 'hoje' : 'neste dia'}`;
  const minutes = workouts.reduce((s, w) => s + w.durationMin, 0);
  const parts = [plural(workouts.length, 'treino', 'treinos'), `${n0(minutes)} min`];
  // A estimativa só chega do servidor com a preferência ligada; com "esconder calorias" nunca aparece
  const withEstimate = workouts.filter((w) => typeof w.estimateKcal === 'number');
  if (!hideCalories && withEstimate.length > 0) {
    parts.push(`≈ ${n0(withEstimate.reduce((s, w) => s + (w.estimateKcal ?? 0), 0))} kcal (estimativa)`);
  }
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Dropdowns da Home: aberto/fechado por usuário, no aparelho
// ---------------------------------------------------------------------------

export type HomeSection = 'meals' | 'activities';
export type SectionState = Partial<Record<HomeSection, boolean>>;

export const sectionsKey = (userId: string) => `bocado:home:sections:${userId}`;

export function readSections(storage: Pick<Storage, 'getItem'> | undefined, key: string): SectionState {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SectionState = {};
    for (const k of ['meals', 'activities'] as const) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSection(storage: Pick<Storage, 'getItem' | 'setItem'> | undefined, key: string, section: HomeSection, open: boolean) {
  try {
    storage?.setItem(key, JSON.stringify({ ...readSections(storage, key), [section]: open }));
  } catch {
    /* sem armazenamento: vale o padrão */
  }
}

/** O estado manual (se houver) vale sobre o padrão: Refeições aberto; Atividades aberto só com treino no dia. */
export function isSectionOpen(section: HomeSection, manual: SectionState, ctx: { hasWorkouts: boolean }): boolean {
  if (typeof manual[section] === 'boolean') return manual[section]!;
  return section === 'meals' ? true : ctx.hasWorkouts;
}

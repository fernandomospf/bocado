/**
 * Movimento da semana e Home (puro, testável): estado da chama, passo da meta, cabeçalhos dos dropdowns e
 * estado aberto/fechado guardado no aparelho. Tom sem culpa (lib/tone.md): nenhuma cobrança, nenhum julgamento.
 * Roda com: npm test (movement.test.mjs)
 */

/** Meta DIÁRIA de movimento (minutos): 15 a 240, de 5 em 5; padrão 30. */
export const MOVEMENT_GOAL_MIN = 15;
export const MOVEMENT_GOAL_MAX = 240;
export const MOVEMENT_GOAL_STEP = 5;
export const MOVEMENT_GOAL_DEFAULT = 30;
/** Ordem dos chips de descanso (Seg a Dom) com o número do dia (0 = domingo … 6 = sábado). */
export const REST_DAY_CHIPS = [
  { day: 1, short: 'Seg', long: 'segunda' },
  { day: 2, short: 'Ter', long: 'terça' },
  { day: 3, short: 'Qua', long: 'quarta' },
  { day: 4, short: 'Qui', long: 'quinta' },
  { day: 5, short: 'Sex', long: 'sexta' },
  { day: 6, short: 'Sáb', long: 'sábado' },
  { day: 0, short: 'Dom', long: 'domingo' },
] as const;

/** Liga/desliga um dia de descanso, sem repetidos e em ordem. */
export function toggleRestDay(days: readonly number[], day: number): number[] {
  const set = new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6));
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return [...set].sort((a, b) => a - b);
}
/** Duração da chama viajando na ponta do arco. */
export const FLAME_TRAVEL_MS = 1400;

/** Valor anterior do medidor, por dia (a Home grava a cada desenho; vale também ao voltar de outra rota). */
export const moveFromKey = (date: string) => `bocado:moveFrom:${date}`;
/** Aviso + vibração da meta do dia batida: uma vez por dia, neste aparelho. */
export const moveReachedKey = (date: string) => `bocado:move:reached:${date}`;

/** Próxima meta no stepper (de 5 em 5, entre 15 e 240). Valores fora do passo encaixam no próximo múltiplo. */
export function stepGoal(current: number | null, direction: 1 | -1): number {
  const base = current ?? MOVEMENT_GOAL_DEFAULT;
  const next = direction > 0 ? Math.floor(base / MOVEMENT_GOAL_STEP) * MOVEMENT_GOAL_STEP + MOVEMENT_GOAL_STEP : Math.ceil(base / MOVEMENT_GOAL_STEP) * MOVEMENT_GOAL_STEP - MOVEMENT_GOAL_STEP;
  return Math.min(MOVEMENT_GOAL_MAX, Math.max(MOVEMENT_GOAL_MIN, next));
}

export type FlameState = 'off' | 'burning' | 'lit';

/**
 * Chama do DIA mostrado: "apagada" sem minutos; "queimando" entre 0 e 100% (a cor esquenta de forma contínua com
 * `heat`); "acesa" só com a meta do dia batida. Sem meta ou em dia de descanso: queimando com os minutos, nunca acesa.
 */
export function flameState(doneMin: number, goalMin: number | null, restDay = false): { state: FlameState; heat: number } {
  if (doneMin <= 0) return { state: 'off', heat: 0 };
  if (restDay || goalMin === null || goalMin <= 0) return { state: 'burning', heat: 0.6 };
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

export type HomeSection = 'meals' | 'activities' | 'supplements';
export type SectionState = Partial<Record<HomeSection, boolean>>;

export const sectionsKey = (userId: string) => `bocado:home:sections:${userId}`;

export function readSections(storage: Pick<Storage, 'getItem'> | undefined, key: string): SectionState {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SectionState = {};
    for (const k of ['meals', 'activities', 'supplements'] as const) {
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

/**
 * O estado manual (se houver) vale sobre o padrão: Refeições aberto; Atividades aberto só com treino no dia;
 * Suplementos e medicações aberto só com item pendente.
 */
export function isSectionOpen(
  section: HomeSection,
  manual: SectionState,
  ctx: { hasWorkouts: boolean; hasPendingSupplements?: boolean },
): boolean {
  if (typeof manual[section] === 'boolean') return manual[section]!;
  if (section === 'meals') return true;
  return section === 'activities' ? ctx.hasWorkouts : !!ctx.hasPendingSupplements;
}

/**
 * Atalhos (/rapido/...): regras puras. ABRIR uma dessas URLs nunca registra nada: a página mostra um cartão de confirmação
 * e só o botão "Registrar" (um POST) muda dados. Aqui ficam a validação dos parâmetros, os links e o retorno seguro depois do login.
 */

export const WATER_MIN_ML = 50;
export const WATER_MAX_ML = 2000;
export const WATER_DEFAULT_ML = 200;
export const WORKOUT_MIN_MIN = 5;
export const WORKOUT_MAX_MIN = 480;
export const WORKOUT_DEFAULT_MIN = 60;
export const FAST_MIN_H = 12;
export const FAST_MAX_H = 20;
export const FAST_DEFAULT_H = 16;

export const WORKOUT_TYPE_PARAM = { musculacao: 'STRENGTH', corrida: 'RUN', bike: 'BIKE', caminhada: 'WALK', outro: 'OTHER' } as const;
export const WORKOUT_INTENSITY_PARAM = { leve: 'LIGHT', moderada: 'MODERATE', forte: 'HARD' } as const;
export type WorkoutTypeParam = keyof typeof WORKOUT_TYPE_PARAM;
export type WorkoutIntensityParam = keyof typeof WORKOUT_INTENSITY_PARAM;
export type MealMode = 'voz' | 'foto' | 'busca';
export const MEAL_MODES: MealMode[] = ['voz', 'foto', 'busca'];

type Params = { get(name: string): string | null };

export interface ShortcutDefaults {
  waterMl: number;
  workoutType: WorkoutTypeParam;
  workoutMin: number;
  workoutInt: WorkoutIntensityParam;
  fastHours: number;
}

export const SHORTCUT_DEFAULTS: ShortcutDefaults = {
  waterMl: WATER_DEFAULT_ML,
  workoutType: 'musculacao',
  workoutMin: WORKOUT_DEFAULT_MIN,
  workoutInt: 'moderada',
  fastHours: FAST_DEFAULT_H,
};

/** Número inteiro de um parâmetro (texto sem lixo), ou null. */
function intParam(raw: string | null): number | null {
  if (raw === null || !/^\d{1,5}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

const inRange = (n: number | null, min: number, max: number): n is number => n !== null && n >= min && n <= max;

export interface WaterAction {
  ml: number;
  /** false = parâmetro ausente fora do limite ou ilegível: o cartão mostra o campo editável com o padrão. */
  valid: boolean;
}

export function parseWater(p: Params, fallback = WATER_DEFAULT_ML): WaterAction {
  const raw = p.get('ml');
  if (raw === null) return { ml: fallback, valid: true };
  const n = intParam(raw);
  return inRange(n, WATER_MIN_ML, WATER_MAX_ML) ? { ml: n, valid: true } : { ml: fallback, valid: false };
}

export interface WorkoutAction {
  type: WorkoutTypeParam;
  min: number;
  intensity: WorkoutIntensityParam;
  valid: boolean;
}

export function parseWorkout(p: Params, d: ShortcutDefaults = SHORTCUT_DEFAULTS): WorkoutAction {
  const rawType = p.get('tipo');
  const rawMin = p.get('min');
  const rawInt = p.get('int');
  const typeOk = rawType === null || rawType in WORKOUT_TYPE_PARAM;
  const intOk = rawInt === null || rawInt in WORKOUT_INTENSITY_PARAM;
  const min = intParam(rawMin);
  const minOk = rawMin === null || inRange(min, WORKOUT_MIN_MIN, WORKOUT_MAX_MIN);
  return {
    type: rawType !== null && rawType in WORKOUT_TYPE_PARAM ? (rawType as WorkoutTypeParam) : d.workoutType,
    min: rawMin !== null && inRange(min, WORKOUT_MIN_MIN, WORKOUT_MAX_MIN) ? min : d.workoutMin,
    intensity: rawInt !== null && rawInt in WORKOUT_INTENSITY_PARAM ? (rawInt as WorkoutIntensityParam) : d.workoutInt,
    valid: typeOk && intOk && minOk,
  };
}

export function parseMealMode(p: Params): MealMode | null {
  const m = p.get('modo');
  return m && (MEAL_MODES as string[]).includes(m) ? (m as MealMode) : null;
}

export function parseFast(p: Params, fallback = FAST_DEFAULT_H): { hours: number; valid: boolean } {
  const raw = p.get('h');
  if (raw === null) return { hours: fallback, valid: true };
  const n = intParam(raw);
  return inRange(n, FAST_MIN_H, FAST_MAX_H) ? { hours: n, valid: true } : { hours: fallback, valid: false };
}

// --- links ---------------------------------------------------------------------------------------------------------

export const QUICK_PATHS = {
  agua: (d: ShortcutDefaults) => `/rapido/agua?ml=${d.waterMl}`,
  treino: (d: ShortcutDefaults) => `/rapido/treino?tipo=${d.workoutType}&min=${d.workoutMin}&int=${d.workoutInt}`,
  peso: () => '/rapido/peso',
  refeicaoVoz: () => '/rapido/refeicao?modo=voz',
  refeicaoFoto: () => '/rapido/refeicao?modo=foto',
  refeicaoBusca: () => '/rapido/refeicao?modo=busca',
  jejum: (d: ShortcutDefaults) => `/rapido/jejum?h=${d.fastHours}`,
} as const;

// --- retorno depois do login ------------------------------------------------------------------------------------------

/**
 * Só aceita caminhos INTERNOS que começam com "/rapido/" (nunca URL externa, "//host", barra invertida nem protocolo).
 * Devolve caminho + query normalizados, ou null.
 */
export function safeReturnPath(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 500) return null;
  if (!raw.startsWith('/rapido/') || raw.startsWith('//') || raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return null;
  try {
    const u = new URL(raw, 'http://bocado.invalid');
    if (u.origin !== 'http://bocado.invalid' || !u.pathname.startsWith('/rapido/')) return null;
    return `${u.pathname}${u.search}`;
  } catch {
    return null;
  }
}

export const RETURN_KEY = 'bocado:returnTo';

/** O login (e-mail ou Google) perde a URL: guardamos o retorno validado e o app logado o consome. */
export function storeReturnPath(raw: string | null | undefined, storage: Pick<Storage, 'setItem'> | undefined) {
  const safe = safeReturnPath(raw);
  if (!safe) return;
  try {
    storage?.setItem(RETURN_KEY, safe);
  } catch {
    /* sem armazenamento */
  }
}

/** Lê e apaga de uma vez; revalida (o valor guardado também não é confiável). */
export function takeReturnPath(storage: Pick<Storage, 'getItem' | 'removeItem'> | undefined): string | null {
  try {
    const v = storage?.getItem(RETURN_KEY) ?? null;
    storage?.removeItem(RETURN_KEY);
    return safeReturnPath(v);
  } catch {
    return null;
  }
}

// --- valores padrão do aparelho -----------------------------------------------------------------------------------------

export const DEFAULTS_KEY = 'bocado:shortcuts';

/** Valores salvos neste aparelho (validados campo a campo; o que estiver fora cai no padrão). */
export function readDefaults(storage: Pick<Storage, 'getItem'> | undefined): ShortcutDefaults {
  try {
    const raw = JSON.parse(storage?.getItem(DEFAULTS_KEY) ?? '{}') as Partial<Record<keyof ShortcutDefaults, unknown>>;
    const num = (v: unknown, min: number, max: number, fb: number) => (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fb);
    const d = SHORTCUT_DEFAULTS;
    return {
      waterMl: num(raw.waterMl, WATER_MIN_ML, WATER_MAX_ML, d.waterMl),
      workoutType: typeof raw.workoutType === 'string' && raw.workoutType in WORKOUT_TYPE_PARAM ? (raw.workoutType as WorkoutTypeParam) : d.workoutType,
      workoutMin: num(raw.workoutMin, WORKOUT_MIN_MIN, WORKOUT_MAX_MIN, d.workoutMin),
      workoutInt: typeof raw.workoutInt === 'string' && raw.workoutInt in WORKOUT_INTENSITY_PARAM ? (raw.workoutInt as WorkoutIntensityParam) : d.workoutInt,
      fastHours: num(raw.fastHours, FAST_MIN_H, FAST_MAX_H, d.fastHours),
    };
  } catch {
    return SHORTCUT_DEFAULTS;
  }
}

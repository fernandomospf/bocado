export type Sex = 'MALE' | 'FEMALE';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER';
export type MealSource = 'MANUAL' | 'PHOTO' | 'TEXT' | 'SEARCH';
export type Confidence = 'low' | 'medium' | 'high';
export type WeekStart = 'MONDAY' | 'SUNDAY';

export interface Me {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  hasPassword: boolean;
  onboarded: boolean;
}

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Suggestion extends Macros {
  bmr: number;
  tdee: number;
}

export interface BodyData {
  sex: Sex;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
}

export interface Profile extends BodyData {
  age: number;
  targets: Macros;
  customTargets: boolean;
  suggestion: Suggestion;
  weekStartsOn: WeekStart;
  /** Relatórios semanais sem nenhuma informação de peso. */
  hideWeightInReports: boolean;
  /** Meta adaptativa: sugerir ajustes da meta a partir do gasto estimado. */
  adaptiveEnabled: boolean;
  /** Treino: mostrar a estimativa de gasto (desligada por padrão) e somar metade à meta do dia (desligada). */
  workoutEstimateEnabled: boolean;
  workoutAddToGoal: boolean;
  updatedAt: string;
}

export interface MealItem extends Macros {
  id: string;
  name: string;
  grams: number;
  /** Valores estimados pela IA e não editados (selo "estimativa"). */
  estimated: boolean;
  /** Receita de origem, quando o item foi registrado a partir de uma. */
  recipeId?: string | null;
}

export interface Meal {
  id: string;
  date: string;
  type: MealType;
  source: MealSource;
  note: string | null;
  createdAt: string;
  totals: Macros;
  items: MealItem[];
}

/** Resposta dos DELETE de refeição/alimento: o que foi apagado, para "Desfazer" (POST /meals/restore). */
export interface MealSnapshot {
  meal: Pick<Meal, 'id' | 'date' | 'type' | 'source' | 'note' | 'createdAt'>;
  items: MealItem[];
  mealDeleted: boolean;
  deletedAt: string;
}

/** Item de uma refeição recente ou favorita (valores da porção registrada). */
export interface QuickItem extends Macros {
  name: string;
  grams: number;
  estimated?: boolean;
}

/** GET /meals/recent: a refeição mais recente de cada conjunto igual de alimentos. */
export interface RecentMeal {
  mealId: string;
  type: MealType;
  date: string;
  times: number;
  totals: Macros;
  items: Required<QuickItem>[];
}

export interface Favorite {
  id: string;
  name: string;
  type: MealType | null;
  items: QuickItem[];
  totals: Macros;
  createdAt: string;
  lastUsedAt: string | null;
}

export type WorkoutType = 'STRENGTH' | 'RUN' | 'BIKE' | 'WALK' | 'OTHER';
export type WorkoutIntensity = 'LIGHT' | 'MODERATE' | 'HARD';

/** Treino do dia (GET /days/:date). `estimateKcal` só vem com a estimativa ligada no Perfil. */
export interface DayWorkout {
  id: string;
  type: WorkoutType;
  durationMin: number;
  intensity: WorkoutIntensity;
  note: string | null;
  estimateKcal?: number;
}

/** Treino completo (POST/PATCH/GET /workouts). */
export interface Workout extends DayWorkout {
  date: string;
  createdAt: string;
}

export interface WorkoutSnapshot {
  workout: Pick<Workout, 'id' | 'date' | 'type' | 'durationMin' | 'intensity' | 'note' | 'createdAt'>;
  deletedAt: string;
}

export interface DaySummary {
  date: string;
  /** Com a soma do treino ligada, `targets.kcal` já inclui o bônus (a base está em `baseTargetKcal`). */
  targets: Macros | null;
  baseTargetKcal?: number;
  goalBonusKcal?: number;
  workouts: DayWorkout[];
  totals: Macros;
  meals: Meal[];
}

export interface RangeSummary {
  from: string;
  to: string;
  targets: Macros | null;
  days: { date: string; meals: number; totals: Macros }[];
}

export interface AnalyzedItem extends Macros {
  name: string;
  grams: number;
  confidence: Confidence;
}

export interface WeightEntry {
  date: string;
  weightKg: number;
  note: string | null;
  /** Média dos registros dos 7 dias terminando nesta data. */
  trendKg: number;
}

export interface WeightList {
  from: string;
  to: string;
  entries: WeightEntry[];
}

export interface WeightSummary {
  latest: { date: string; weightKg: number } | null;
  trendKg: number | null;
  change7Kg: number | null;
  change30Kg: number | null;
  targetsWeightKg: number | null;
  targetsOutdated: boolean;
}

/** 'off' = Open Food Facts; 'label' = acervo Bocado (lido do rótulo por um usuário). */
export type FoodOrigin = 'history' | 'recipe' | 'custom' | 'off' | 'label' | 'taco';

/** Resultado da busca de alimentos; valores sempre por 100 g. */
export interface FoodResult {
  id?: string;
  name: string;
  origin: FoodOrigin;
  per100: Macros;
  portion?: { grams: number; label: string };
  timesUsed?: number;
  /** Só receitas: peso da receita inteira. */
  whole?: { grams: number };
  /** Só produtos industrializados. */
  brand?: string | null;
  barcode?: string | null;
}

export type BarcodeLookup =
  | { found: true; origin: 'local' | 'off'; food: FoodResult }
  | { found: false; code: string };

export interface RecipeIngredient extends Macros {
  id?: string;
  foodId: string | null;
  name: string;
  grams: number;
}

export interface RecipeNutrition {
  totals: Macros;
  rawGrams: number;
  baseGrams: number;
  per100: Macros;
  portionGrams: number | null;
  weightWarning: boolean;
}

export interface RecipeSummary {
  id: string;
  name: string;
  servings: number | null;
  baseGrams: number;
  per100: Macros;
  portionGrams: number | null;
  ingredientCount: number;
  isOwner: boolean;
  shared: boolean;
  /** Quantas vezes o usuário registrou a receita (a lista vem ordenada por isso). */
  timesUsed: number;
  updatedAt: string;
}

export interface RecipeDetail {
  id: string;
  name: string;
  notes: string | null;
  totalCookedGrams: number | null;
  servings: number | null;
  isOwner: boolean;
  shared: boolean;
  nutrition: RecipeNutrition;
  ingredients: RecipeIngredient[];
  updatedAt: string;
}

export type FatLevel = 'none' | 'little' | 'lots';
export type FatKind = 'oil' | 'butter' | 'sauce' | 'unknown';
export type FatRefKind = Exclude<FatKind, 'unknown'>;

/** Palpite da IA sobre a gordura de preparo, que fica fora dos itens. */
export interface PreparationFatGuess {
  level: FatLevel;
  kind: FatKind;
  reason: string;
}

export interface AnalysisResult {
  title: string;
  notes: string | null;
  items: AnalyzedItem[];
  totals: Macros;
  hasCookedFood: boolean;
  preparationFat: PreparationFatGuess;
}

export interface FatPortion extends Macros {
  grams: number;
  /** Medida caseira, ex.: "1 colher de chá". */
  portion: string;
}

/** GET /analysis/preparation-fat: valores de referência por tipo e nível. */
export type PreparationFatTable = Record<
  FatRefKind,
  { label: string; per100: Macros; fromTaco: boolean; little: FatPortion; lots: FatPortion }
>;

/** De onde veio a sugestão: refeição que a pessoa já comeu, modelo de prato, despensa ou IA. */
export type SuggestionOrigin = 'history' | 'template' | 'pantry' | 'ai';

export interface SuggestionItem extends Macros {
  name: string;
  grams: number;
  /** Quantidade amigável: "150 g Peito de frango grelhado", "2 ovos cozidos", "1 concha de feijão". */
  label: string;
}

export interface MealSuggestion {
  title: string;
  items: SuggestionItem[];
  totals: Macros;
  fit: number;
  good: boolean;
  origin: 'local' | 'ai';
  mainOrigin: SuggestionOrigin;
  steps?: string[];
  minutes?: number | null;
}

/** "Para fechar o dia". `remaining` é o que falta de verdade; `target`, o que UMA refeição deve cobrir. */
export interface CloseDayResponse {
  date: string;
  remaining: Macros | null;
  target: Macros | null;
  priority: 'protein' | 'balanced' | null;
  closed: boolean;
  suggestions: MealSuggestion[];
  source: 'local' | 'ai' | 'none';
  canAskAi: boolean;
  aiRemaining: number;
  isPremiumFeature: boolean;
  /** Ingredientes que a pessoa mais usa (chips do "O que tem em casa?"). */
  pantryChips: string[];
  /** Só nas respostas da despensa: o que foi reconhecido no texto. */
  pantry?: { recognized: { term: string; name: string }[]; unknown: string[] };
}

// --- Relatório semanal (GET /reports/weekly) ---

export interface WeeklyDay {
  date: string;
  kcal: number;
  logged: boolean;
  goalKcal: number;
}

export type WeeklyHighlight =
  | { kind: 'topProtein'; date: string; protein: number }
  | { kind: 'mealShare'; mealType: MealType; share: number }
  | { kind: 'streak'; days: number };

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  days: WeeklyDay[];
  loggedDays: number;
  insufficientData: boolean;
  targets?: Macros;
  avg?: Macros;
  /** Positivo = abaixo da meta. */
  balanceVsTargetKcal?: number;
  /** `kg` é a estimativa (kcal / 7700), positivo = abaixo do gasto; null com o peso oculto. */
  balanceVsExpenditure?: { kcal: number; kg: number | null; tdee: number };
  daysOnTarget?: number;
  daysProteinHit?: number;
  highlights?: WeeklyHighlight[];
  weight?: { thisWeekKg: number; previousWeekKg: number; measuredKg: number; expectedKg: number | null } | null;
  weightNote?: 'hidden' | 'needTwoThisWeek' | 'needPreviousWeek' | null;
  lowIntakeNote?: boolean;
  /** Só contexto (não entra no balanço): contagem e minutos de treino da semana. */
  workouts: { count: number; totalMinutes: number; byType: Partial<Record<WorkoutType, { count: number; minutes: number }>> };
}

export interface WeeklyListItem {
  weekStart: string;
  weekEnd: string;
  loggedDays: number;
}

// --- Meta adaptativa (GET /adaptive/status) ---

export type AdaptiveState = 'disabled' | 'collecting' | 'no_change' | 'suggestion' | 'paused';
export type AdaptiveNote = 'under18' | 'underweight_loss' | 'fast_loss' | 'low_intake';
export type AdaptiveConfidence = 'LOW' | 'MEDIUM' | 'HIGH';

export interface AdaptiveStatus {
  enabled: boolean;
  state: AdaptiveState;
  progress: {
    usableDays: number;
    weighIns: number;
    daysSinceStart: number;
    needed: { daysSinceStart: number; usableDays: number; weighIns: number; weighInsPerEnd: number };
  };
  estimate?: {
    tdee: number;
    usedTdee: number;
    confidence: AdaptiveConfidence;
    avgIntake: number;
    weightStartKg: number;
    weightEndKg: number;
    windowStart: string;
    windowEnd: string;
  };
  suggestion?: {
    currentKcal: number;
    newKcal: number;
    macros: { protein: number; carbs: number; fat: number };
    formulaTdee: number;
  };
  notes: AdaptiveNote[];
  snoozedUntil?: string;
}

export interface AdaptiveHistoryItem {
  id: string;
  createdAt: string;
  action: 'APPLIED' | 'DISMISSED' | 'SNOOZED';
  previousKcal: number;
  newKcal: number | null;
  estimatedTdee: number;
  confidence: AdaptiveConfidence;
  windowStart: string;
  windowEnd: string;
}

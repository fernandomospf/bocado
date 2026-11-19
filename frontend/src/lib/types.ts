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
  /** Modo "esconder calorias": a interface mostra só proteína e constância. */
  hideCalories: boolean;
  /** Meta adaptativa: sugerir ajustes da meta a partir do gasto estimado. */
  adaptiveEnabled: boolean;
  /** Treino: mostrar a estimativa de gasto (desligada por padrão) e somar metade à meta do dia (desligada). */
  workoutEstimateEnabled: boolean;
  workoutAddToGoal: boolean;
  /** Contador de água. */
  waterEnabled: boolean;
  waterGoalMode: 'AUTO' | 'MANUAL';
  waterGoalManualMl: number | null;
  waterBottleMl: number | null;
  /** Medidor de movimento e a meta DIÁRIA em minutos (15 a 240; null = só os minutos, sem meta). */
  movementEnabled: boolean;
  movementDailyGoalMin: number | null;
  /** Dias de descanso: 0 = domingo … 6 = sábado. */
  movementRestDays: number[];
  /** Registro de suplementos e medicações (dado sensível; desligado por padrão; indisponível a menores de 18 anos). */
  supplementsEnabled: boolean;
  /** Na tela Hoje, mostra "Medicação 1" / "Suplemento 2" em vez do nome. */
  supplementsMaskNamesOnHome: boolean;
  /** Acessibilidade: modos forçados (além do que o sistema pede). */
  a11yHighContrast: boolean;
  a11yReduceTransparency: boolean;
  a11yReduceMotion: boolean;
  /** Jejum intermitente (privado, desligado por padrão). */
  fastingEnabled: boolean;
  /** Modo GLP-1 (privado). Com ele desligado, `proteinFloorG` e a sugestão vêm nulos. */
  glp1Mode: boolean;
  proteinFloorG: number | null;
  proteinFloorSuggestion: number | null;
  /** Meta de peso (kg), se houver. */
  goalWeightKg: number | null;
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
  /** Veio de uma divisão com a casa (enviada ou recebida). */
  shared?: boolean;
  /** Quem dividiu comigo, se ainda é da minha casa. */
  sharedBy?: { id: string; name: string };
  /** Com quem eu dividi (só nomes de quem ainda é da casa). */
  splitWith?: { id: string; name: string }[];
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

/** Resumo da semana de movimento (GET /workouts/week). */
export interface MovementWeek {
  weekStart: string;
  weekEnd: string;
  doneMin: number;
  workoutsCount: number;
  daysLeft: number;
  byDay: { date: string; minutes: number; count: number; restDay: boolean; reached: boolean }[];
  /** Só com a estimativa ligada e sem "esconder calorias". */
  estimateKcal: number | null;
  dailyGoalMin: number | null;
  /** 7 menos os dias de descanso. */
  activeDays: number;
  /** Dias ativos com a meta diária batida; null sem meta. */
  daysReached: number | null;
}

/** Movimento de um dia (GET /days/:date). */
export interface DayMovement {
  minutes: number;
  goalMin: number | null;
  restDay: boolean;
  /** minutes >= goalMin, fora de dia de descanso. */
  reached: boolean;
  /** Só com a estimativa ligada, sem "esconder calorias" e com treino no dia. */
  estimateKcal: number | null;
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
  movement: DayMovement;
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
  /** Meta de peso: a linha-alvo do gráfico. */
  goalWeightKg: number | null;
}

/** Progresso rumo à meta de peso (sem datas nem prazos). */
export interface WeightGoal {
  targetKg: number;
  startKg: number;
  /** Tendência atual (ou o último peso). */
  currentKg: number;
  remainingKg: number;
  /** 0 a 100. */
  progressPct: number;
  reached: boolean;
  direction: 'down' | 'up';
}

export interface WeightSummary {
  latest: { date: string; weightKg: number } | null;
  trendKg: number | null;
  change7Kg: number | null;
  change30Kg: number | null;
  targetsWeightKg: number | null;
  targetsOutdated: boolean;
  goal: WeightGoal | null;
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
  /** Produto confirmado por 2 ou mais pessoas diferentes (selo "Verificado"). */
  verified?: boolean;
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
  /** Nome de quem criou, só em receita da casa que é de outra pessoa. */
  ownerName?: string | null;
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
  /** Só no prato por quilo: o peso da balança, a que as gramas dos itens somam. */
  totalGrams?: number;
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
  /** Movimento: meta diária batida em N de M dias ativos (null com o medidor desligado ou sem meta). */
  movement?: { dailyGoalMin: number; daysReached: number; activeDays: number } | null;
  /** Água: dias com registro e dias com a meta batida (null com o contador desligado ou sem registro). */
  water?: { loggedDays: number; goalDays: number } | null;
  /** Meta de peso: quanto falta (só com o peso visível nos relatórios). */
  weightGoal?: { targetKg: number; remainingKg: number } | null;
  /** Modo GLP-1 (privado): piso de proteína, bem-estar resumido e o aviso de baixa ingestão. */
  glp1?: {
    proteinFloorG: number;
    proteinFloorDays: number;
    wellbeing: { loggedDays: number; nausea: [number, number, number]; gi: [number, number, number] } | null;
    lowIntake: boolean;
  } | null;
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

export interface HouseholdMember {
  id: string;
  name: string;
  avatarUrl: string | null;
  role: 'OWNER' | 'MEMBER';
}

/** A casa do usuário. Os membros só expõem nome, foto e papel (nunca e-mail ou dados do diário). */
export interface Household {
  id: string;
  name: string;
  maxMembers: number;
  me: { role: 'OWNER' | 'MEMBER'; autoAcceptShared: boolean };
  members: HouseholdMember[];
}

export interface HouseholdInvite {
  id: string;
  code: string;
  link: string;
  expiresAt: string;
}

export interface InvitePreview {
  householdName: string;
  inviterFirstName: string;
}

/** Oferta de refeição dividida, recebida de alguém da casa. */
export interface SharedOffer {
  id: string;
  date: string;
  type: MealType;
  share: number;
  from: { id: string; name: string; avatarUrl: string | null };
  totals: Macros;
  items: { name: string; grams: number }[];
  expiresAt: string;
}

export interface SharedMealResult {
  meal: Meal;
  delivered: { userId: string; name: string; status: 'added' | 'offered' }[];
}

// --- Água ---

export interface WaterEntry {
  id: string;
  amountMl: number;
  createdAt: string;
}

export interface WaterDay {
  date: string;
  /** Meta que valia naquele dia (null se a pessoa ainda precisa definir a própria). */
  goalMl: number | null;
  totalMl: number;
  entries: WaterEntry[];
  goalSource: 'auto' | 'manual';
  needsManualGoal: boolean;
  explain: { weightKg: number | null; baseMl: number | null; workoutMl: number | null };
}

export interface WaterRangeDay {
  date: string;
  goalMl: number | null;
  totalMl: number;
}

// --- Suplementos e medicações (o app só registra o que a pessoa informa) -------------------------------

export type SupplementCategory = 'MEDICATION' | 'SUPPLEMENT' | 'VITAMIN' | 'OTHER';
export type DoseUnit = 'ML' | 'MG' | 'MCG' | 'G' | 'UI' | 'TABLET' | 'CAPSULE' | 'SCOOP' | 'DROP' | 'OTHER';
export type Administration = 'ORAL' | 'INJECTION' | 'OTHER';
export type ScheduleType = 'DAILY' | 'WEEKDAYS' | 'EVERY_N_DAYS';
export type Slot = 'ANY' | 'MORNING' | 'AFTERNOON' | 'NIGHT';
export type InjectionSite = 'ABDOMEN_L' | 'ABDOMEN_R' | 'THIGH_L' | 'THIGH_R' | 'GLUTE_L' | 'GLUTE_R' | 'DELTOID_L' | 'DELTOID_R' | 'OTHER';

export interface SupplementPlan {
  id: string;
  name: string;
  category: SupplementCategory;
  administration: Administration;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel: string | null;
  scheduleType: ScheduleType;
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[];
  intervalDays: number | null;
  slots: Slot[];
  startDate: string;
  endDate: string | null;
  notes: string | null;
  trackSite: boolean;
  showOnWeightChart: boolean;
  archived: boolean;
  nextDate: string | null;
  createdAt: string;
}

export type SupplementItemStatus = 'pending' | 'taken' | 'skipped' | 'unlogged';

export interface SupplementItem {
  planId: string;
  name: string;
  category: SupplementCategory;
  administration: Administration;
  trackSite: boolean;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel: string | null;
  slot: Slot;
  status: SupplementItemStatus;
  logId?: string;
  takenAt?: string | null;
  site?: InjectionSite | null;
  /** Dia previsto da dose (nas pendências dos dias anteriores, é o dia original). */
  dueDate: string;
}

export interface SupplementDay {
  items: SupplementItem[];
  next: { planId: string; name: string; nextDate: string }[];
  suggestedSites: Record<string, InjectionSite>;
}

export interface IntakeLog {
  id: string;
  planId: string;
  date: string;
  slot: Slot;
  status: 'TAKEN' | 'SKIPPED';
  takenAt: string | null;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel: string | null;
  site: InjectionSite | null;
  note: string | null;
}

export interface WeightMarker {
  date: string;
  planId: string;
  label: string;
}

/** Bem-estar do dia (modo GLP-1 ou suplementos): escalas de 0 a 3, nulas = sem resposta. */
export interface WellbeingDay {
  date: string;
  nausea: number | null;
  appetite: number | null;
  energy: number | null;
  gi: number | null;
  note: string | null;
  /** "Dia N desde a última aplicação" do plano injetável (só com suplementos ligados). */
  dayOfCycle?: number | null;
}

/** Uma importação de histórico de peso (Perfil > Peso). */
export interface WeightImportRecord {
  id: string;
  source: 'CSV' | 'APPLE_HEALTH';
  createdAt: string;
  count: number;
}

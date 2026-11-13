export type Sex = 'MALE' | 'FEMALE';
export type ActivityLevel = 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
export type GoalType = 'LOSE' | 'MAINTAIN' | 'GAIN';
export type MealType = 'BREAKFAST' | 'LUNCH' | 'SNACK' | 'DINNER';
export type MealSource = 'MANUAL' | 'PHOTO' | 'TEXT' | 'SEARCH';
export type Confidence = 'low' | 'medium' | 'high';

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
  updatedAt: string;
}

export interface MealItem extends Macros {
  id: string;
  name: string;
  grams: number;
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

export interface DaySummary {
  date: string;
  targets: Macros | null;
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

export interface AnalysisResult {
  title: string;
  notes: string | null;
  items: AnalyzedItem[];
  totals: Macros;
}

export type SuggestionOrigin = 'history' | 'recipe' | 'taco' | 'ai';

export interface SuggestionItem extends Macros {
  name: string;
  grams: number;
  origin: SuggestionOrigin;
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
}

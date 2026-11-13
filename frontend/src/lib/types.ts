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

export type FoodOrigin = 'history' | 'custom' | 'taco';

/** Resultado da busca de alimentos; valores sempre por 100 g. */
export interface FoodResult {
  id?: string;
  name: string;
  origin: FoodOrigin;
  per100: Macros;
  portion?: { grams: number; label: string };
  timesUsed?: number;
}

export interface AnalysisResult {
  title: string;
  notes: string | null;
  items: AnalyzedItem[];
  totals: Macros;
}

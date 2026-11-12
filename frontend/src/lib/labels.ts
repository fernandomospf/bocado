import type { ActivityLevel, GoalType, MealType } from './types';

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  SNACK: 'Lanches',
  DINNER: 'Jantar',
};

export const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export function mealTypeForNow(date = new Date()): MealType {
  const h = date.getHours();
  if (h < 10) return 'BREAKFAST';
  if (h < 15) return 'LUNCH';
  if (h < 18) return 'SNACK';
  return 'DINNER';
}

export const GOAL_OPTIONS: { value: GoalType; label: string; hint: string }[] = [
  { value: 'LOSE', label: 'Perder peso', hint: 'Déficit moderado, com proteína alta para preservar músculo' },
  { value: 'MAINTAIN', label: 'Manter o peso', hint: 'Comer o quanto o corpo gasta' },
  { value: 'GAIN', label: 'Ganhar massa', hint: 'Pequeno superávit para construir músculo' },
];

export const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'SEDENTARY', label: 'Sedentário', hint: 'Pouco ou nenhum exercício, trabalho sentado' },
  { value: 'LIGHT', label: 'Leve', hint: 'Exercício 1 a 3 vezes por semana' },
  { value: 'MODERATE', label: 'Moderado', hint: 'Exercício 3 a 5 vezes por semana' },
  { value: 'ACTIVE', label: 'Intenso', hint: 'Treino puxado 6 a 7 vezes por semana' },
  { value: 'VERY_ACTIVE', label: 'Muito intenso', hint: 'Treino diário pesado ou trabalho físico' },
];

import { ActivityLevel, GoalType, Sex } from '@prisma/client';

export interface BodyData {
  sex: Sex;
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goal: GoalType;
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Suggestion extends Targets {
  bmr: number;
  tdee: number;
}

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  SEDENTARY: 1.2,
  LIGHT: 1.375,
  MODERATE: 1.55,
  ACTIVE: 1.725,
  VERY_ACTIVE: 1.9,
};

const GOAL_KCAL_FACTOR: Record<GoalType, number> = {
  LOSE: 0.8, // déficit de ~20%
  MAINTAIN: 1,
  GAIN: 1.1, // superávit de ~10%
};

const PROTEIN_G_PER_KG: Record<GoalType, number> = {
  LOSE: 2.0, // preserva massa magra no déficit
  MAINTAIN: 1.6,
  GAIN: 1.8,
};

export function ageFrom(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() ||
    (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Mifflin-St Jeor para TMB, multiplicado pelo fator de atividade (GET).
 * Proteína por kg; com IMC acima de 30 usa o peso de referência (IMC 25)
 * para não superestimar. Gordura em 25% das calorias (mín. 0,6 g/kg),
 * carboidratos completam o restante.
 */
export function suggestTargets(data: BodyData): Suggestion {
  const age = ageFrom(data.birthDate);
  const heightM = data.heightCm / 100;
  const bmi = data.weightKg / (heightM * heightM);
  const refWeight = bmi > 30 ? 25 * heightM * heightM : data.weightKg;

  const bmr =
    10 * data.weightKg + 6.25 * data.heightCm - 5 * age + (data.sex === Sex.MALE ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTORS[data.activityLevel];

  let kcal = tdee * GOAL_KCAL_FACTOR[data.goal];
  const floor = data.sex === Sex.MALE ? 1500 : 1200;
  kcal = Math.max(kcal, floor);
  kcal = Math.round(kcal / 10) * 10;

  const protein = Math.round(refWeight * PROTEIN_G_PER_KG[data.goal]);
  const fat = Math.round(Math.max((kcal * 0.25) / 9, refWeight * 0.6));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));

  return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, carbs, fat };
}

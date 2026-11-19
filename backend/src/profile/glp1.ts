import type { Sex } from '@prisma/client';
import { calorieFloor } from './nutrition';

/**
 * Modo GLP-1: regras puras (sem banco). O Bocado só organiza o registro; não orienta sobre a medicação.
 */

/** Referência geral para o piso de proteína, em g por kg da tendência de peso. Não é prescrição: a pessoa edita. */
export const PROTEIN_G_PER_KG = 1.2;
export const PROTEIN_FLOOR_SUGGESTION_MAX = 200;
export const PROTEIN_FLOOR_MIN = 30;
export const PROTEIN_FLOOR_MAX = 300;

/**
 * Sugestão do piso de proteína: o MAIOR entre a meta de proteína atual e 1,2 g por kg da tendência de peso,
 * limitado a 200 g. (Referência geral, não uma recomendação individual; a pessoa pode editar.)
 */
export function suggestProteinFloor(proteinTarget: number, trendKg: number | null): number {
  const byWeight = trendKg !== null && trendKg > 0 ? Math.round(PROTEIN_G_PER_KG * trendKg) : 0;
  return Math.min(PROTEIN_FLOOR_SUGGESTION_MAX, Math.max(proteinTarget, byWeight));
}

/** O piso valendo: o editado pela pessoa, ou a sugestão. */
export const effectiveProteinFloor = (stored: number | null, suggestion: number) => stored ?? suggestion;

/** Quantos dias registrados entram na média do aviso de baixa ingestão, e o mínimo para avaliá-la. */
export const LOW_INTAKE_DAYS = 5;
export const LOW_INTAKE_MIN_DAYS = 3;

/**
 * Aviso de segurança (o único sobre comer pouco): média das calorias dos últimos 5 dias REGISTRADOS abaixo do piso
 * de calorias do app (1200 F / 1500 M). `dailyKcal` vem do dia mais recente para o mais antigo. Com menos de 3 dias
 * registrados não há base para avaliar, então não dispara.
 */
export function isLowIntake(dailyKcal: number[], sex: Sex): boolean {
  const recent = dailyKcal.slice(0, LOW_INTAKE_DAYS);
  if (recent.length < LOW_INTAKE_MIN_DAYS) return false;
  const avg = recent.reduce((s, k) => s + k, 0) / recent.length;
  return avg < calorieFloor(sex);
}

/** Escalas do bem-estar: 0 a 3. */
export const WELLBEING_MAX = 3;

export interface WellbeingRow {
  nausea: number | null;
  appetite?: number | null;
  energy?: number | null;
  gi: number | null;
}

/** Quantos dias tiveram cada nível (1 a 3) de uma escala. Índice 0 = nível 1 (leve). */
function levelCounts(rows: WellbeingRow[], key: 'nausea' | 'gi'): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  for (const r of rows) {
    const v = r[key];
    if (v !== null && v !== undefined && v >= 1 && v <= WELLBEING_MAX) out[v - 1]++;
  }
  return out;
}

/** Resumo neutro do bem-estar da semana (contagens; o app escreve "Náusea leve em 2 dias"). */
export function summarizeWellbeing(rows: WellbeingRow[]) {
  return { loggedDays: rows.length, nausea: levelCounts(rows, 'nausea'), gi: levelCounts(rows, 'gi') };
}

/** Dias registrados com a proteína no piso ou acima dele. */
export const proteinFloorDays = (days: { protein: number }[], floor: number) => days.filter((d) => d.protein >= floor).length;

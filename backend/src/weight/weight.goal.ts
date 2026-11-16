import type { GoalType } from '@prisma/client';

/** Abaixo disso o IMC da meta não é aceito (referência de faixa de peso saudável para adultos). */
export const MIN_GOAL_BMI = 18.5;
/** "Chegou perto": a tendência a até 0,3 kg da meta, ou já cruzou na direção do objetivo. */
export const GOAL_REACHED_KG = 0.3;
export const LOSE_MIN_DIFF_KG = 0.5;
export const MAINTAIN_MAX_DIFF_KG = 2;

export const GOAL_MIN_KG = 30;
export const GOAL_MAX_KG = 350;

export const UNDER_18_MESSAGE = 'Metas de peso não estão disponíveis para menores de 18 anos.';
export const LOW_BMI_MESSAGE =
  'Esse valor ficaria abaixo da faixa de peso considerada saudável. Escolha outra meta ou converse com um profissional de saúde.';

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const bmiOf = (weightKg: number, heightCm: number) => weightKg / ((heightCm / 100) ** 2);

/**
 * Valida a meta. Devolve a mensagem (422) ou null se estiver tudo certo. Não altera o objetivo do perfil:
 * quando diverge, explica e sugere ajustar o objetivo em Perfil.
 */
export function goalProblem(input: { goalKg: number; currentKg: number; heightCm: number; goal: GoalType }): string | null {
  const { goalKg, currentKg, heightCm, goal } = input;
  if (bmiOf(goalKg, heightCm) < MIN_GOAL_BMI) return LOW_BMI_MESSAGE;

  const diff = round2(currentKg - goalKg); // positivo = meta abaixo do peso atual
  if (goal === 'LOSE' && diff < LOSE_MIN_DIFF_KG) {
    return `O seu objetivo no perfil é perder peso, e a meta precisa ficar pelo menos ${fmt(LOSE_MIN_DIFF_KG)} kg abaixo do peso atual (${fmt(currentKg)} kg). Escolha outro valor ou ajuste o objetivo em Perfil.`;
  }
  if (goal === 'GAIN' && diff >= 0) {
    return `O seu objetivo no perfil é ganhar massa, e a meta precisa ficar acima do peso atual (${fmt(currentKg)} kg). Escolha outro valor ou ajuste o objetivo em Perfil.`;
  }
  if (goal === 'MAINTAIN' && Math.abs(diff) > MAINTAIN_MAX_DIFF_KG) {
    return `O seu objetivo no perfil é manter o peso, e a meta pode ficar a no máximo ${fmt(MAINTAIN_MAX_DIFF_KG)} kg do peso atual (${fmt(currentKg)} kg). Escolha outro valor ou ajuste o objetivo em Perfil.`;
  }
  return null;
}

export interface GoalSummary {
  targetKg: number;
  startKg: number;
  /** Tendência atual (ou o último peso, sem tendência). */
  currentKg: number;
  remainingKg: number;
  /** 0 a 100, limitado. */
  progressPct: number;
  reached: boolean;
  direction: 'down' | 'up';
}

/** Progresso em direção à meta. Sem datas, sem prazos: só onde a pessoa está entre o início e a meta. */
export function goalProgress(input: { targetKg: number; startKg: number; currentKg: number }): GoalSummary {
  const { targetKg, startKg, currentKg } = input;
  const direction: 'down' | 'up' = targetKg <= startKg ? 'down' : 'up';
  const total = Math.abs(startKg - targetKg);
  const done = direction === 'down' ? startKg - currentKg : currentKg - startKg;
  const crossed = direction === 'down' ? currentKg <= targetKg : currentKg >= targetKg;
  const reached = crossed || Math.abs(currentKg - targetKg) <= GOAL_REACHED_KG + 1e-9;
  const pct = total < 0.05 ? (reached ? 100 : 0) : Math.min(100, Math.max(0, (done / total) * 100));
  return {
    targetKg,
    startKg,
    currentKg,
    remainingKg: crossed ? 0 : round1(Math.abs(currentKg - targetKg)),
    progressPct: Math.round(pct * 10) / 10,
    reached,
    direction,
  };
}

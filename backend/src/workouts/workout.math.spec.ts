import { estimateKcal, GOAL_BONUS_CAP_KCAL, goalBonusKcal, grossKcal, MET, netKcal, summarizeDayWorkouts, summarizeWeek } from './workout.math';

const run60 = { type: 'RUN' as const, intensity: 'MODERATE' as const, durationMin: 60 };

describe('MET × peso × horas', () => {
  it('kcal brutas = MET × kg × horas', () => {
    expect(grossKcal(run60, 70)).toBeCloseTo(9.8 * 70, 5); // 686
    expect(grossKcal({ ...run60, durationMin: 30 }, 70)).toBeCloseTo(343, 5);
  });

  it('kcal líquidas = (MET − 1) × kg × horas (sem o repouso)', () => {
    expect(netKcal(run60, 70)).toBeCloseTo((9.8 - 1) * 70, 5); // 616
    expect(netKcal({ type: 'STRENGTH', intensity: 'MODERATE', durationMin: 90 }, 80)).toBeCloseTo(4 * 80 * 1.5, 5); // 480
  });

  it('as líquidas são sempre menores que as brutas, pela parcela do repouso (1 MET)', () => {
    for (const type of Object.keys(MET) as (keyof typeof MET)[]) {
      for (const intensity of ['LIGHT', 'MODERATE', 'HARD'] as const) {
        const w = { type, intensity, durationMin: 60 };
        expect(grossKcal(w, 70) - netKcal(w, 70)).toBeCloseTo(70, 5);
      }
    }
  });

  it('a tabela de MET traz os valores combinados', () => {
    expect(MET.STRENGTH).toEqual({ LIGHT: 3.5, MODERATE: 5.0, HARD: 6.0 });
    expect(MET.RUN).toEqual({ LIGHT: 7.0, MODERATE: 9.8, HARD: 11.8 });
    expect(MET.BIKE).toEqual({ LIGHT: 4.0, MODERATE: 6.8, HARD: 10.0 });
    expect(MET.WALK).toEqual({ LIGHT: 2.8, MODERATE: 3.5, HARD: 4.8 });
    expect(MET.OTHER).toEqual({ LIGHT: 3.0, MODERATE: 5.0, HARD: 7.0 });
  });

  it('a estimativa de um treino é a líquida arredondada a 10 kcal', () => {
    expect(estimateKcal(run60, 70)).toBe(620); // 616
  });
});

describe('bônus da meta do dia', () => {
  it('50% das líquidas, arredondado a 10 kcal', () => {
    expect(goalBonusKcal([run60], 70)).toBe(310); // 616 × 0,5 = 308
    expect(goalBonusKcal([{ type: 'WALK', intensity: 'LIGHT', durationMin: 30 }], 60)).toBe(30); // (2,8 − 1) × 60 kg × 0,5 h = 54, metade = 27, em 10 kcal
  });

  it('soma as líquidas de todos os treinos do dia antes de pegar metade', () => {
    const a = { type: 'STRENGTH' as const, intensity: 'MODERATE' as const, durationMin: 60 };
    const b = { type: 'WALK' as const, intensity: 'MODERATE' as const, durationMin: 60 };
    expect(goalBonusKcal([a, b], 70)).toBe(Math.round(((4 * 70 + 2.5 * 70) * 0.5) / 10) * 10); // 230
  });

  it(`teto de ${GOAL_BONUS_CAP_KCAL} kcal por dia`, () => {
    const marathon = { type: 'RUN' as const, intensity: 'HARD' as const, durationMin: 480 };
    expect(goalBonusKcal([marathon], 100)).toBe(GOAL_BONUS_CAP_KCAL);
  });

  it('sem treino, bônus zero', () => {
    expect(goalBonusKcal([], 70)).toBe(0);
  });
});

describe('summarizeDayWorkouts (preferências)', () => {
  const w = [{ id: 'a', ...run60 }];

  it('padrão (tudo desligado): sem estimativa e sem bônus', () => {
    const out = summarizeDayWorkouts(w, 70, { workoutEstimateEnabled: false, workoutAddToGoal: false });
    expect(out.workouts).toEqual([{ id: 'a', type: 'RUN', durationMin: 60, intensity: 'MODERATE', note: null }]);
    expect(out.goalBonusKcal).toBeUndefined();
  });

  it('só a estimativa ligada: estimateKcal, mas sem bônus', () => {
    const out = summarizeDayWorkouts(w, 70, { workoutEstimateEnabled: true, workoutAddToGoal: false });
    expect(out.workouts[0].estimateKcal).toBe(620);
    expect(out.goalBonusKcal).toBeUndefined();
  });

  it('o bônus só vale com as DUAS preferências ligadas', () => {
    expect(summarizeDayWorkouts(w, 70, { workoutEstimateEnabled: true, workoutAddToGoal: true }).goalBonusKcal).toBe(310);
    expect(summarizeDayWorkouts(w, 70, { workoutEstimateEnabled: false, workoutAddToGoal: true }).goalBonusKcal).toBeUndefined();
  });

  it('dia sem treino: sem bônus mesmo com tudo ligado', () => {
    expect(summarizeDayWorkouts([], 70, { workoutEstimateEnabled: true, workoutAddToGoal: true })).toEqual({ workouts: [] });
  });
});

describe('summarizeWeek', () => {
  it('conta treinos e minutos, total e por tipo', () => {
    const s = summarizeWeek([
      { type: 'STRENGTH', durationMin: 60 },
      { type: 'STRENGTH', durationMin: 50 },
      { type: 'RUN', durationMin: 40 },
    ]);
    expect(s).toEqual({ count: 3, totalMinutes: 150, byType: { STRENGTH: { count: 2, minutes: 110 }, RUN: { count: 1, minutes: 40 } } });
  });

  it('semana sem treino', () => {
    expect(summarizeWeek([])).toEqual({ count: 0, totalMinutes: 0, byType: {} });
  });
});

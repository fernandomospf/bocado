import { computeStreak, computeWaterGoal, goalReached, roundTo } from './water.math';

describe('computeWaterGoal', () => {
  it('35 ml por kg, arredondado a 50 ml', () => {
    expect(computeWaterGoal({ weightKg: 70, workoutMinutes: 0 })).toEqual({ goalMl: 2450, baseMl: 2450, workoutMl: 0 });
    // 72,3 kg = 2530,5 -> base 2531 (round), total 2531 -> 2550
    expect(computeWaterGoal({ weightKg: 72.3, workoutMinutes: 0 })).toMatchObject({ baseMl: 2531, goalMl: 2550 });
    expect(roundTo(2524, 50)).toBe(2500);
    expect(roundTo(2525, 50)).toBe(2550);
  });

  it('treino: + 10 ml por minuto, com acréscimo máximo de 1000 ml', () => {
    expect(computeWaterGoal({ weightKg: 70, workoutMinutes: 45 })).toEqual({ goalMl: 2900, baseMl: 2450, workoutMl: 450 });
    expect(computeWaterGoal({ weightKg: 60, workoutMinutes: 100 }).workoutMl).toBe(1000);
    expect(computeWaterGoal({ weightKg: 60, workoutMinutes: 300 })).toMatchObject({ workoutMl: 1000, goalMl: 3100 });
  });

  it('piso de 1500 ml e teto de 4000 ml', () => {
    expect(computeWaterGoal({ weightKg: 35, workoutMinutes: 0 }).goalMl).toBe(1500); // 1225 -> piso
    expect(computeWaterGoal({ weightKg: 30, workoutMinutes: 0 }).goalMl).toBe(1500);
    expect(computeWaterGoal({ weightKg: 130, workoutMinutes: 0 }).goalMl).toBe(4000); // 4550 -> teto
    expect(computeWaterGoal({ weightKg: 110, workoutMinutes: 100 }).goalMl).toBe(4000);
  });

  it('minutos inválidos não derrubam o cálculo', () => {
    expect(computeWaterGoal({ weightKg: 70, workoutMinutes: -10 }).workoutMl).toBe(0);
  });
});

describe('goalReached', () => {
  it('bate quando o total chega à meta do PRÓPRIO dia', () => {
    expect(goalReached(2000, 2000)).toBe(true);
    expect(goalReached(1999, 2000)).toBe(false);
    expect(goalReached(5000, null)).toBe(false);
  });
});

describe('computeStreak (datas locais YYYY-MM-DD)', () => {
  const d = (dates: string[]) => dates.map((date) => ({ date, reached: true }));
  const TODAY = '2026-11-16';

  it('hoje bateu: a sequência termina hoje', () => {
    expect(computeStreak(d(['2026-11-14', '2026-11-15', '2026-11-16']), TODAY)).toEqual({ current: 3, best: 3 });
  });
  it('hoje ainda não bateu: a sequência termina ontem (não zera à toa)', () => {
    expect(computeStreak(d(['2026-11-14', '2026-11-15']), TODAY)).toEqual({ current: 2, best: 2 });
  });
  it('um dia sem bater quebra a sequência; o melhor é guardado', () => {
    expect(computeStreak(d(['2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-15', '2026-11-16']), TODAY)).toEqual({ current: 2, best: 4 });
    expect(computeStreak(d(['2026-11-13', '2026-11-15']), TODAY)).toEqual({ current: 1, best: 1 });
  });
  it('dia registrado mas abaixo da meta não conta', () => {
    const days = [{ date: '2026-11-15', reached: true }, { date: '2026-11-14', reached: false }, { date: '2026-11-13', reached: true }];
    expect(computeStreak(days, TODAY)).toEqual({ current: 1, best: 1 });
  });
  it('sem dias, zero; virada de mês e de ano contam como consecutivos', () => {
    expect(computeStreak([], TODAY)).toEqual({ current: 0, best: 0 });
    expect(computeStreak(d(['2026-12-30', '2026-12-31', '2027-01-01']), '2027-01-01')).toEqual({ current: 3, best: 3 });
  });
});

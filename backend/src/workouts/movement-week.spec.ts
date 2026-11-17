import { WorkoutsService } from './workouts.service';
import { summarizeMovementWeek } from './workout.math';

const TODAY = '2026-11-17'; // terça-feira
const w = (date: string, durationMin: number, type: 'RUN' | 'STRENGTH' = 'RUN') => ({ date, type, intensity: 'MODERATE' as const, durationMin });
const base = { today: TODAY, goalMin: 150, weightKg: 70, showEstimate: true };

describe('summarizeMovementWeek', () => {
  it('semana começando na segunda: 16 a 22; o domingo 15 fica na semana anterior', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [w('2026-11-15', 40), w('2026-11-16', 30), w('2026-11-22', 20), w('2026-11-23', 99)] });
    expect([s.weekStart, s.weekEnd]).toEqual(['2026-11-16', '2026-11-22']);
    expect(s.doneMin).toBe(50);
    expect(s.workoutsCount).toBe(2);
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[0]).toEqual({ date: '2026-11-16', minutes: 30, count: 1 });
  });

  it('semana começando no domingo: 15 a 21; o domingo 15 entra e o dia 22 sai', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'SUNDAY', workouts: [w('2026-11-15', 40), w('2026-11-16', 30), w('2026-11-22', 20)] });
    expect([s.weekStart, s.weekEnd]).toEqual(['2026-11-15', '2026-11-21']);
    expect(s.doneMin).toBe(70);
  });

  it('soma minutos de vários treinos no mesmo dia e conta os dias que restam (inclusive hoje)', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [w('2026-11-17', 30), w('2026-11-17', 15, 'STRENGTH')] });
    expect(s.byDay[1]).toEqual({ date: '2026-11-17', minutes: 45, count: 2 });
    expect(s.daysLeft).toBe(6); // ter a dom
    expect(summarizeMovementWeek({ ...base, today: '2026-11-22', weekStartsOn: 'MONDAY', workouts: [] }).daysLeft).toBe(1);
  });

  it('reached no limite exato (149 não, 150 sim, 151 sim)', () => {
    const at = (min: number) => summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [w('2026-11-16', min)] });
    expect(at(149)).toMatchObject({ reached: false, remainingMin: 1 });
    expect(at(150)).toMatchObject({ reached: true, remainingMin: 0 });
    expect(at(151)).toMatchObject({ reached: true, remainingMin: 0 });
  });

  it('sem meta: nunca "batida", sem minutos restantes, mas com os minutos', () => {
    const s = summarizeMovementWeek({ ...base, goalMin: null, weekStartsOn: 'MONDAY', workouts: [w('2026-11-16', 500)] });
    expect(s).toMatchObject({ goalMin: null, reached: false, remainingMin: null, doneMin: 500 });
  });

  it('estimateKcal soma as estimativas líquidas por treino; nulo com showEstimate falso', () => {
    // corrida moderada 60 min, 70 kg: (9,8 − 1) × 70 = 616 → 620; musculação 30 min: (5 − 1) × 70 × 0,5 = 140
    const input = { ...base, weekStartsOn: 'MONDAY' as const, workouts: [w('2026-11-16', 60), w('2026-11-17', 30, 'STRENGTH')] };
    expect(summarizeMovementWeek(input).estimateKcal).toBe(760);
    expect(summarizeMovementWeek({ ...input, showEstimate: false }).estimateKcal).toBeNull();
  });
});

describe('WorkoutsService.week', () => {
  const setup = (profile: Record<string, unknown> | null) => {
    const prisma = {
      profile: { findUnique: jest.fn().mockResolvedValue(profile) },
      workout: {
        findMany: jest.fn().mockResolvedValue([{ date: new Date('2026-11-16T00:00:00Z'), type: 'RUN', intensity: 'MODERATE', durationMin: 60 }]),
      },
    };
    return { prisma, service: new WorkoutsService(prisma as never) };
  };
  const p = (over: Record<string, unknown> = {}) => ({ weekStartsOn: 'MONDAY', movementGoalMin: 150, weightKg: 70, workoutEstimateEnabled: true, hideCalories: false, ...over });

  it('só consulta treinos do usuário da sessão, no intervalo da semana', async () => {
    const { service, prisma } = setup(p());
    const res = await service.week('user-1', TODAY);
    const where = prisma.workout.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.date.gte.toISOString().slice(0, 10)).toBe('2026-11-16');
    expect(where.date.lte.toISOString().slice(0, 10)).toBe('2026-11-22');
    expect(res).toMatchObject({ doneMin: 60, goalMin: 150, estimateKcal: 620 });
  });

  it('estimateKcal nulo com a preferência desligada e com hideCalories', async () => {
    expect((await setup(p({ workoutEstimateEnabled: false })).service.week('u', TODAY)).estimateKcal).toBeNull();
    expect((await setup(p({ hideCalories: true })).service.week('u', TODAY)).estimateKcal).toBeNull();
  });

  it('meta nula (menor de 18 sem meta) devolve goalMin nulo; semana segue o início escolhido', async () => {
    const res = await setup(p({ movementGoalMin: null, weekStartsOn: 'SUNDAY' })).service.week('u', TODAY);
    expect(res).toMatchObject({ goalMin: null, reached: false, weekStart: '2026-11-15' });
  });
});

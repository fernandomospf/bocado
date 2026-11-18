import { MealsService } from '../meals/meals.service';
import { WorkoutsService } from './workouts.service';
import { isRestDay, summarizeMovementDay, summarizeMovementWeek } from './workout.math';

const TODAY = '2026-11-17'; // terça-feira (2)
const w = (date: string, durationMin: number, type: 'RUN' | 'STRENGTH' = 'RUN') => ({ date, type, intensity: 'MODERATE' as const, durationMin });
const base = { today: TODAY, dailyGoalMin: 30, restDays: [] as number[], weightKg: 70, showEstimate: true };
const dayBase = { date: TODAY, goalMin: 30, restDays: [] as number[], weightKg: 70, showEstimate: true };

describe('isRestDay: dia da semana sai da data local, sem fuso', () => {
  it('0 = domingo … 6 = sábado', () => {
    expect(isRestDay('2026-11-15', [0])).toBe(true); // domingo
    expect(isRestDay('2026-11-21', [6])).toBe(true); // sábado
    expect(isRestDay('2026-11-17', [0, 6])).toBe(false); // terça
    expect(isRestDay('2026-01-01', [4])).toBe(true); // quinta (virada de ano)
    expect(isRestDay('2028-02-29', [2])).toBe(true); // terça (ano bissexto)
  });
});

describe('summarizeMovementDay', () => {
  it('reached no limite: 29 não, 30 sim, 31 sim (soma vários treinos do dia)', () => {
    const at = (...mins: number[]) => summarizeMovementDay({ ...dayBase, workouts: mins.map((m) => w(TODAY, m)) });
    expect(at(29)).toMatchObject({ minutes: 29, goalMin: 30, reached: false, restDay: false });
    expect(at(30)).toMatchObject({ minutes: 30, reached: true });
    expect(at(15, 16)).toMatchObject({ minutes: 31, reached: true });
    expect(at()).toMatchObject({ minutes: 0, reached: false });
  });

  it('dia de descanso: nunca reached, mesmo com treino; a meta continua visível', () => {
    const m = summarizeMovementDay({ ...dayBase, restDays: [2], workouts: [w(TODAY, 90)] });
    expect(m).toMatchObject({ minutes: 90, goalMin: 30, restDay: true, reached: false });
  });

  it('sem meta (menor de 18): só os minutos, nunca reached', () => {
    expect(summarizeMovementDay({ ...dayBase, goalMin: null, workouts: [w(TODAY, 500)] })).toMatchObject({ minutes: 500, goalMin: null, reached: false });
  });

  it('estimateKcal: soma das líquidas do dia; nula sem a preferência e sem treino', () => {
    // corrida moderada 60 min, 70 kg: (9,8 − 1) × 70 = 616 → 620; musculação 30 min: (5 − 1) × 70 × 0,5 = 140
    const workouts = [w(TODAY, 60), w(TODAY, 30, 'STRENGTH')];
    expect(summarizeMovementDay({ ...dayBase, workouts }).estimateKcal).toBe(760);
    expect(summarizeMovementDay({ ...dayBase, workouts, showEstimate: false }).estimateKcal).toBeNull();
    expect(summarizeMovementDay({ ...dayBase, workouts: [] }).estimateKcal).toBeNull();
  });
});

describe('summarizeMovementWeek', () => {
  it('semana começando na segunda: 16 a 22; o domingo 15 fica na semana anterior', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [w('2026-11-15', 40), w('2026-11-16', 30), w('2026-11-22', 20), w('2026-11-23', 99)] });
    expect([s.weekStart, s.weekEnd]).toEqual(['2026-11-16', '2026-11-22']);
    expect(s.doneMin).toBe(50);
    expect(s.workoutsCount).toBe(2);
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay[0]).toEqual({ date: '2026-11-16', minutes: 30, count: 1, restDay: false, reached: true });
  });

  it('semana começando no domingo: 15 a 21; o domingo 15 entra e o dia 22 sai', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'SUNDAY', workouts: [w('2026-11-15', 40), w('2026-11-16', 30), w('2026-11-22', 20)] });
    expect([s.weekStart, s.weekEnd]).toEqual(['2026-11-15', '2026-11-21']);
    expect(s.doneMin).toBe(70);
  });

  it('dias que restam na semana (inclusive hoje)', () => {
    expect(summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [] }).daysLeft).toBe(6); // ter a dom
    expect(summarizeMovementWeek({ ...base, today: '2026-11-22', weekStartsOn: 'MONDAY', workouts: [] }).daysLeft).toBe(1);
  });

  it('activeDays = 7 − descansos; daysReached conta só dias ativos com a meta batida', () => {
    // seg 30 (batida), ter 29 (não), qua 45 (batida), sáb 60 (descanso: não conta), dom 0 (descanso)
    const s = summarizeMovementWeek({
      ...base,
      weekStartsOn: 'MONDAY',
      restDays: [6, 0],
      workouts: [w('2026-11-16', 30), w('2026-11-17', 29), w('2026-11-18', 45), w('2026-11-21', 60)],
    });
    expect(s).toMatchObject({ activeDays: 5, daysReached: 2, dailyGoalMin: 30, doneMin: 164 });
    expect(s.byDay[5]).toMatchObject({ date: '2026-11-21', restDay: true, reached: false, minutes: 60 });
  });

  it('sem descanso: 7 dias ativos; descansos repetidos ou inválidos não contam duas vezes', () => {
    expect(summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [] }).activeDays).toBe(7);
    expect(summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', restDays: [0, 0, 9], workouts: [] }).activeDays).toBe(6);
  });

  it('a meta semanal saiu: goalMin nulo, reached falso, remainingMin nulo', () => {
    const s = summarizeMovementWeek({ ...base, weekStartsOn: 'MONDAY', workouts: [w('2026-11-16', 500)] });
    expect(s).toMatchObject({ goalMin: null, reached: false, remainingMin: null, doneMin: 500 });
  });

  it('sem meta diária: daysReached nulo, mas com os minutos', () => {
    const s = summarizeMovementWeek({ ...base, dailyGoalMin: null, weekStartsOn: 'MONDAY', workouts: [w('2026-11-16', 90)] });
    expect(s).toMatchObject({ dailyGoalMin: null, daysReached: null, activeDays: 7, doneMin: 90 });
  });

  it('estimateKcal soma as estimativas líquidas por treino; nulo com showEstimate falso', () => {
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
  const p = (over: Record<string, unknown> = {}) => ({
    weekStartsOn: 'MONDAY',
    movementDailyGoalMin: 30,
    movementRestDays: [0],
    weightKg: 70,
    workoutEstimateEnabled: true,
    hideCalories: false,
    ...over,
  });

  it('só consulta treinos do usuário da sessão, no intervalo da semana; devolve dias ativos e batidos', async () => {
    const { service, prisma } = setup(p());
    const res = await service.week('user-1', TODAY);
    const where = prisma.workout.findMany.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.date.gte.toISOString().slice(0, 10)).toBe('2026-11-16');
    expect(where.date.lte.toISOString().slice(0, 10)).toBe('2026-11-22');
    expect(res).toMatchObject({ doneMin: 60, goalMin: null, dailyGoalMin: 30, activeDays: 6, daysReached: 1, estimateKcal: 620 });
  });

  it('estimateKcal nulo com a preferência desligada e com hideCalories', async () => {
    expect((await setup(p({ workoutEstimateEnabled: false })).service.week('u', TODAY)).estimateKcal).toBeNull();
    expect((await setup(p({ hideCalories: true })).service.week('u', TODAY)).estimateKcal).toBeNull();
  });

  it('sem meta (menor de 18): daysReached nulo; semana segue o início escolhido', async () => {
    const res = await setup(p({ movementDailyGoalMin: null, weekStartsOn: 'SUNDAY' })).service.week('u', TODAY);
    expect(res).toMatchObject({ dailyGoalMin: null, daysReached: null, weekStart: '2026-11-15' });
  });

  it('sem perfil: sem meta, 7 dias ativos', async () => {
    expect(await setup(null).service.week('u', TODAY)).toMatchObject({ dailyGoalMin: null, daysReached: null, activeDays: 7 });
  });
});

describe('MealsService.day: movimento do dia', () => {
  function dayService(prefs: object | null, workouts: object[]) {
    const prisma = {
      meal: { findMany: jest.fn().mockResolvedValue([]) },
      workout: { findMany: jest.fn().mockResolvedValue(workouts) },
      profile: { findUnique: jest.fn().mockResolvedValue(prefs) },
    };
    const profiles = { targetsFor: jest.fn().mockResolvedValue({ kcal: 2000, protein: 120, carbs: 250, fat: 70 }) };
    return { prisma, service: new MealsService(prisma as never, profiles as never) };
  }
  const prefs = (over: object = {}) => ({
    weightKg: 70,
    workoutEstimateEnabled: true,
    workoutAddToGoal: false,
    hideCalories: false,
    movementDailyGoalMin: 30,
    movementRestDays: [] as number[],
    ...over,
  });
  const run = (min: number) => ({ id: 'w1', type: 'RUN', intensity: 'MODERATE', durationMin: min, note: null });

  it('minutos, meta, reached e estimativa do dia', async () => {
    const d = await dayService(prefs(), [run(60)]).service.day('u', TODAY);
    expect(d.movement).toEqual({ minutes: 60, goalMin: 30, restDay: false, reached: true, estimateKcal: 620 });
  });

  it('29 vs 30 minutos', async () => {
    expect((await dayService(prefs(), [run(29)]).service.day('u', TODAY)).movement.reached).toBe(false);
    expect((await dayService(prefs(), [run(30)]).service.day('u', TODAY)).movement.reached).toBe(true);
  });

  it('dia de descanso (terça = 2): restDay, sem reached', async () => {
    const d = await dayService(prefs({ movementRestDays: [2] }), [run(60)]).service.day('u', TODAY);
    expect(d.movement).toMatchObject({ restDay: true, reached: false, minutes: 60 });
  });

  it('estimateKcal nulo com a preferência desligada e com hideCalories', async () => {
    expect((await dayService(prefs({ workoutEstimateEnabled: false }), [run(60)]).service.day('u', TODAY)).movement.estimateKcal).toBeNull();
    expect((await dayService(prefs({ hideCalories: true }), [run(60)]).service.day('u', TODAY)).movement.estimateKcal).toBeNull();
  });

  it('menor de 18 (meta nula): só os minutos', async () => {
    const d = await dayService(prefs({ movementDailyGoalMin: null }), [run(45)]).service.day('u', TODAY);
    expect(d.movement).toMatchObject({ minutes: 45, goalMin: null, reached: false });
  });

  it('dia passado: usa só os treinos daquela data', async () => {
    const { service, prisma } = dayService(prefs(), [run(40)]);
    const d = await service.day('u', '2026-11-02');
    expect(prisma.workout.findMany.mock.calls[0][0].where.date.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(d.movement).toMatchObject({ minutes: 40, reached: true });
  });
});

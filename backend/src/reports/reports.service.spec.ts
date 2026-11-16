import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ReportsService } from './reports.service';

const profile = {
  userId: 'user-1',
  sex: 'FEMALE',
  birthDate: new Date('1990-01-01T00:00:00Z'),
  heightCm: 165,
  weightKg: 70,
  activityLevel: 'MODERATE',
  goal: 'LOSE',
  kcalTarget: 1800,
  proteinTarget: 120,
  carbsTarget: 200,
  fatTarget: 60,
  weekStartsOn: 'MONDAY',
  hideWeightInReports: false,
};

const mealRow = (date: string, kcal: number) => ({
  date: new Date(`${date}T00:00:00.000Z`),
  type: 'LUNCH',
  items: [{ kcal, protein: 100, carbs: 200, fat: 60 }],
});

function setup({ hasProfile = true, meals = [] as object[], logged = [] as string[], over = {} } = {}) {
  const prisma = {
    profile: { findUnique: jest.fn().mockResolvedValue(hasProfile ? { ...profile, ...over } : null) },
    meal: { findMany: jest.fn().mockResolvedValue(meals) },
    weightEntry: { findMany: jest.fn().mockResolvedValue([]) },
    workout: { findMany: jest.fn().mockResolvedValue([]) },
    waterDay: { findMany: jest.fn().mockResolvedValue([]) },
    waterEntry: { groupBy: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue(logged.map((date) => ({ date }))),
  };
  return { prisma, service: new ReportsService(prisma as never) };
}

describe('ReportsService (posse e regras)', () => {
  it('só lê perfil, refeições e peso do usuário da sessão', async () => {
    const { service, prisma } = setup({ meals: ['09', '10', '11', '12'].map((d) => mealRow(`2026-11-${d}`, 1800)) });
    const r = await service.weekly('user-1', '2026-11-12');
    expect(r.weekStart).toBe('2026-11-09'); // normaliza para a segunda
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    expect(prisma.meal.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    expect(prisma.weightEntry.findMany.mock.calls[0][0].where.userId).toBe('user-1');
  });

  it('refeição sem alimentos não conta como dia registrado', async () => {
    const empty = { date: new Date('2026-11-09T00:00:00Z'), type: 'LUNCH', items: [] };
    const { service } = setup({ meals: [empty, ...['10', '11', '12'].map((d) => mealRow(`2026-11-${d}`, 1800))] });
    expect((await service.weekly('user-1', '2026-11-09')).loggedDays).toBe(3);
  });

  it('recusa semana futura e responde 404 sem perfil', async () => {
    const { service } = setup();
    const future = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
    await expect(service.weekly('user-1', future)).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup({ hasProfile: false }).service.weekly('user-1', '2026-11-09')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('o peso oculto não chega na resposta quando hideWeightInReports = true', async () => {
    const { service, prisma } = setup({ over: { hideWeightInReports: true }, meals: ['09', '10', '11', '12'].map((d) => mealRow(`2026-11-${d}`, 1800)) });
    prisma.weightEntry.findMany.mockResolvedValue([{ date: new Date('2026-11-10T00:00:00Z'), weightKg: 70 }]);
    const r = await service.weekly('user-1', '2026-11-09');
    expect(r.weight).toBeNull();
    expect(r.weightNote).toBe('hidden');
    expect(r.balanceVsExpenditure!.kg).toBeNull();
  });
});

describe('ReportsService: treinos no relatório', () => {
  it('traz contagem, minutos e por tipo, só do usuário, sem mudar o balanço', async () => {
    const meals = ['09', '10', '11', '12'].map((d) => mealRow(`2026-11-${d}`, 1800));
    const without = await setup({ meals }).service.weekly('user-1', '2026-11-09');
    const { service, prisma } = setup({ meals });
    prisma.workout.findMany.mockResolvedValue([
      { type: 'STRENGTH', durationMin: 60 },
      { type: 'STRENGTH', durationMin: 50 },
      { type: 'RUN', durationMin: 40 },
    ]);
    const r = await service.weekly('user-1', '2026-11-09');
    expect(r.workouts).toEqual({ count: 3, totalMinutes: 150, byType: { STRENGTH: { count: 2, minutes: 110 }, RUN: { count: 1, minutes: 40 } } });
    expect(prisma.workout.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    // O treino é só contexto: o balanço e as médias são idênticos aos de uma semana sem treino
    expect({ ...r, workouts: undefined }).toEqual({ ...without, workouts: undefined });
  });

  it('semana sem treino: zeros', async () => {
    const r = await setup({ meals: ['09', '10', '11', '12'].map((d) => mealRow(`2026-11-${d}`, 1800)) }).service.weekly('user-1', '2026-11-09');
    expect(r.workouts).toEqual({ count: 0, totalMinutes: 0, byType: {} });
  });

  it('também vem na semana com poucos dias registrados', async () => {
    const r = await setup({ meals: [mealRow('2026-11-09', 1800)] }).service.weekly('user-1', '2026-11-09');
    expect(r.insufficientData).toBe(true);
    expect(r.workouts).toBeDefined();
  });
});

describe('ReportsService.pending', () => {
  it('devolve a semana candidata com os dias registrados; sem nenhum dia, null', async () => {
    const some = setup({ logged: ['2026-11-10', '2026-11-09'] });
    // segunda 16/11: a semana anterior (09 a 15)
    expect(await some.service.pending('user-1', '2026-11-16', 9)).toEqual({ weekStart: '2026-11-09', weekEnd: '2026-11-15', loggedDays: 2 });
    expect(await setup().service.pending('user-1', '2026-11-16', 9)).toBeNull();
  });

  it('domingo às 18h com início na segunda: a semana corrente; antes das 18h, a anterior', async () => {
    const after = setup({ logged: ['2026-11-10'] });
    expect((await after.service.pending('user-1', '2026-11-15', 18))!.weekStart).toBe('2026-11-09');
    const before = setup({ logged: ['2026-11-03'] });
    expect((await before.service.pending('user-1', '2026-11-15', 17))!.weekStart).toBe('2026-11-02');
  });

  it('início no domingo: sempre a semana anterior à corrente', async () => {
    const { service } = setup({ over: { weekStartsOn: 'SUNDAY' }, logged: ['2026-11-09'] });
    expect((await service.pending('user-1', '2026-11-15', 8))!.weekStart).toBe('2026-11-08');
  });

  it('a consulta dos dias registrados é do usuário da sessão', async () => {
    const { service, prisma } = setup({ logged: ['2026-11-10'] });
    await service.pending('user-1', '2026-11-16', 9);
    const sql = prisma.$queryRaw.mock.calls[0];
    expect(sql.slice(1)).toContain('user-1');
  });
});

describe('ReportsService.list', () => {
  it('agrupa por semana na ordem do mais recente, conta os dias e respeita o limite', async () => {
    const { service } = setup({ logged: ['2026-11-12', '2026-11-10', '2026-11-04', '2026-10-28', '2026-10-27'] });
    expect(await service.list('user-1', 2)).toEqual([
      { weekStart: '2026-11-09', weekEnd: '2026-11-15', loggedDays: 2 },
      { weekStart: '2026-11-02', weekEnd: '2026-11-08', loggedDays: 1 },
    ]);
  });

  it('nunca passa de 12 semanas', async () => {
    const logged = Array.from({ length: 20 }, (_, i) => new Date(Date.UTC(2026, 10, 15 - i * 7)).toISOString().slice(0, 10));
    expect(await setup({ logged }).service.list('user-1', 99)).toHaveLength(12);
  });
});

import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BadRequestException as BRE } from '@nestjs/common';
import { MealsService } from '../meals/meals.service';
import { ProfileService } from '../profile/profile.service';
import { CreateWorkoutDto } from './dto/workout.dto';
import { WorkoutsService } from './workouts.service';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const TODAY = new Date().toISOString().slice(0, 10);
const future = new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10);

const row = (over: Record<string, unknown> = {}) => ({
  id: 'w1',
  userId: 'user-1',
  date: day('2026-11-10'),
  type: 'STRENGTH',
  durationMin: 60,
  intensity: 'MODERATE',
  note: 'costas e bíceps',
  createdAt: new Date('2026-11-10T20:00:00Z'),
  ...over,
});

function setup({ owned = true, estimate = false } = {}) {
  const prisma = {
    profile: { findUnique: jest.fn().mockResolvedValue({ weightKg: 70, workoutEstimateEnabled: estimate }) },
    workout: {
      findFirst: jest.fn().mockImplementation(async () => (owned ? row() : null)),
      findMany: jest.fn().mockResolvedValue([row()]),
      create: jest.fn().mockImplementation(async ({ data }) => row({ ...data, id: data.id ?? 'novo' })),
      update: jest.fn().mockImplementation(async ({ data }) => row(data)),
      delete: jest.fn(),
    },
  };
  return { prisma, service: new WorkoutsService(prisma as never) };
}

describe('validação do DTO (duração)', () => {
  const check = async (durationMin: unknown) =>
    validate(plainToInstance(CreateWorkoutDto, { date: '2026-11-10', type: 'RUN', intensity: 'LIGHT', durationMin }));

  it('aceita de 5 a 480 minutos', async () => {
    for (const d of [5, 60, 480]) expect(await check(d)).toHaveLength(0);
  });
  it('recusa 4, 481, decimais e texto', async () => {
    for (const d of [4, 481, 0, 30.5, '30', null]) expect((await check(d)).length).toBeGreaterThan(0);
  });
});

describe('WorkoutsService: posse e datas', () => {
  it('criar recusa data futura e grava no usuário da sessão', async () => {
    const { service, prisma } = setup();
    await expect(service.create('user-1', { date: future, type: 'RUN', durationMin: 30, intensity: 'LIGHT' })).rejects.toBeInstanceOf(BadRequestException);
    await service.create('user-1', { date: TODAY, type: 'RUN', durationMin: 30, intensity: 'LIGHT', note: ' ' });
    expect(prisma.workout.create.mock.calls[0][0].data).toMatchObject({ userId: 'user-1', note: null });
  });

  it('editar, apagar e repetir de outro usuário: 404, sem tocar em nada', async () => {
    const { service, prisma } = setup({ owned: false });
    await expect(service.update('user-2', 'w1', { durationMin: 45 })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('user-2', 'w1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.repeat('user-2', 'w1', TODAY)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.workout.findFirst).toHaveBeenCalledWith({ where: { id: 'w1', userId: 'user-2' } });
    expect(prisma.workout.update).not.toHaveBeenCalled();
    expect(prisma.workout.delete).not.toHaveBeenCalled();
    expect(prisma.workout.create).not.toHaveBeenCalled();
  });

  it('editar recusa data futura; nota vazia apaga a nota', async () => {
    const { service, prisma } = setup();
    await expect(service.update('user-1', 'w1', { date: future })).rejects.toBeInstanceOf(BadRequestException);
    await service.update('user-1', 'w1', { note: '' });
    expect(prisma.workout.update.mock.calls[0][0].data).toEqual({ note: null });
  });

  it('listar só os do usuário, no máximo 93 dias', async () => {
    const { service, prisma } = setup();
    await service.list('user-1', '2026-11-01', '2026-11-15');
    expect(prisma.workout.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    await expect(service.list('user-1', '2026-01-01', '2026-11-15')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list('user-1', '2026-11-15', '2026-11-01')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WorkoutsService: repeat, last e estimativa', () => {
  it('repeat copia o treino SEM a nota para a data informada', async () => {
    const { service, prisma } = setup();
    await service.repeat('user-1', 'w1', TODAY);
    expect(prisma.workout.create.mock.calls[0][0].data).toEqual({
      userId: 'user-1',
      date: day(TODAY),
      type: 'STRENGTH',
      durationMin: 60,
      intensity: 'MODERATE',
    });
  });

  it('repeat recusa data futura', async () => {
    const { service } = setup();
    await expect(service.repeat('user-1', 'w1', future)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('last devolve o mais recente do usuário (ou null)', async () => {
    const { service, prisma } = setup();
    expect(await service.last('user-1')).toMatchObject({ id: 'w1', type: 'STRENGTH' });
    expect(prisma.workout.findFirst).toHaveBeenCalledWith({ where: { userId: 'user-1' }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    prisma.workout.findFirst.mockResolvedValue(null);
    expect(await service.last('user-1')).toBeNull();
  });

  it('a estimativa (líquida, em 10 kcal) só vem com a preferência ligada', async () => {
    expect(await setup({ estimate: false }).service.last('user-1')).not.toHaveProperty('estimateKcal');
    const on = await setup({ estimate: true }).service.last('user-1');
    expect(on).toHaveProperty('estimateKcal', 280); // (5,0 − 1) × 70 × 1 h
  });
});

describe('WorkoutsService: remover e desfazer', () => {
  it('remover devolve o snapshot completo', async () => {
    const { service, prisma } = setup();
    const snap = await service.remove('user-1', 'w1');
    expect(prisma.workout.delete).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(snap.workout).toMatchObject({ id: 'w1', date: '2026-11-10', type: 'STRENGTH', durationMin: 60, note: 'costas e bíceps' });
    expect(Date.parse(snap.deletedAt)).toBeGreaterThan(Date.now() - 5000);
  });

  it('restore recria com o MESMO id e o dono da sessão (nunca o do snapshot)', async () => {
    const { service, prisma } = setup();
    const snap = await service.remove('user-1', 'w1');
    await service.restore('user-2', { snapshot: snap } as never);
    expect(prisma.workout.create.mock.calls[0][0].data).toMatchObject({ id: 'w1', userId: 'user-2', type: 'STRENGTH', note: 'costas e bíceps' });
  });

  it('restore recusa passado o prazo de 10 minutos, relógio adiantado e data futura', async () => {
    const { service } = setup();
    const snap = await service.remove('user-1', 'w1');
    const old = { ...snap, deletedAt: new Date(Date.now() - 11 * 60_000).toISOString() };
    await expect(service.restore('user-1', { snapshot: old } as never)).rejects.toBeInstanceOf(GoneException);
    const ahead = { ...snap, deletedAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    await expect(service.restore('user-1', { snapshot: ahead } as never)).rejects.toBeInstanceOf(BRE);
    const fut = { ...snap, workout: { ...snap.workout, date: future } };
    await expect(service.restore('user-1', { snapshot: fut } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('dois "Desfazer": o segundo vira 409', async () => {
    const { service, prisma } = setup();
    const snap = await service.remove('user-1', 'w1');
    prisma.workout.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(service.restore('user-1', { snapshot: snap } as never)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('MealsService.day: treino como contexto', () => {
  const base = { kcal: 2200, protein: 120, carbs: 250, fat: 70 };
  function dayService(prefs: object | null, workouts: object[]) {
    const prisma = {
      meal: { findMany: jest.fn().mockResolvedValue([]) },
      workout: { findMany: jest.fn().mockResolvedValue(workouts) },
      profile: { findUnique: jest.fn().mockResolvedValue(prefs) },
    };
    const profiles = { targetsFor: jest.fn().mockResolvedValue(base) };
    return { prisma, service: new MealsService(prisma as never, profiles as never) };
  }
  const prefs = (estimate: boolean, add: boolean) => ({ weightKg: 70, workoutEstimateEnabled: estimate, workoutAddToGoal: add });
  const w = [{ id: 'w1', type: 'RUN', intensity: 'MODERATE', durationMin: 60 }];

  it('padrão: lista os treinos, sem estimativa e com a meta intacta', async () => {
    const d = await dayService(prefs(false, false), w).service.day('user-1', '2026-11-10');
    expect(d.workouts).toEqual([{ id: 'w1', type: 'RUN', durationMin: 60, intensity: 'MODERATE', note: null }]);
    expect(d.targets).toEqual(base);
    expect(d).not.toHaveProperty('goalBonusKcal');
  });

  it('estimativa ligada: estimateKcal, e a meta continua a mesma', async () => {
    const d = await dayService(prefs(true, false), w).service.day('user-1', '2026-11-10');
    expect(d.workouts[0].estimateKcal).toBe(620);
    expect(d.targets).toEqual(base);
  });

  it('as duas ligadas: meta efetiva = base + bônus, com a base e o bônus à parte', async () => {
    const d = await dayService(prefs(true, true), w).service.day('user-1', '2026-11-10');
    expect(d.targets!.kcal).toBe(2200 + 310);
    expect(d).toMatchObject({ baseTargetKcal: 2200, goalBonusKcal: 310 });
    expect(d.targets).toMatchObject({ protein: 120, carbs: 250, fat: 70 }); // macros não mudam
  });

  it('a meta salva do perfil nunca é alterada (o dia só lê)', async () => {
    const { service, prisma } = dayService(prefs(true, true), w);
    await service.day('user-1', '2026-11-10');
    expect(Object.keys(prisma.profile)).toEqual(['findUnique']); // sem update
  });

  it('só os treinos do usuário da sessão', async () => {
    const { service, prisma } = dayService(prefs(true, true), w);
    await service.day('user-1', '2026-11-10');
    expect(prisma.workout.findMany.mock.calls[0][0].where.userId).toBe('user-1');
  });
});

describe('ProfileService.updatePreferences: soma à meta só com a estimativa ligada', () => {
  function profileService(existing: object) {
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue({ birthDate: new Date('1990-01-01'), sex: 'FEMALE', weekStartsOn: 'MONDAY', ...existing }),
        update: jest.fn().mockImplementation(async ({ data }) => ({ birthDate: new Date('1990-01-01'), sex: 'FEMALE', heightCm: 165, weightKg: 70, activityLevel: 'MODERATE', goal: 'LOSE', kcalTarget: 1800, proteinTarget: 120, carbsTarget: 180, fatTarget: 60, weekStartsOn: 'MONDAY', ...data })),
      },
    };
    return { prisma, service: new ProfileService(prisma as never) };
  }

  it('ligar a soma com a estimativa desligada: 400', async () => {
    const { service, prisma } = profileService({ workoutEstimateEnabled: false, workoutAddToGoal: false });
    await expect(service.updatePreferences('user-1', { workoutAddToGoal: true })).rejects.toBeInstanceOf(BRE);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('ligar as duas de uma vez funciona', async () => {
    const { service, prisma } = profileService({ workoutEstimateEnabled: false, workoutAddToGoal: false });
    await service.updatePreferences('user-1', { workoutEstimateEnabled: true, workoutAddToGoal: true });
    expect(prisma.profile.update.mock.calls[0][0].data).toMatchObject({ workoutEstimateEnabled: true, workoutAddToGoal: true });
  });

  it('desligar a estimativa desliga a soma junto', async () => {
    const { service, prisma } = profileService({ workoutEstimateEnabled: true, workoutAddToGoal: true });
    await service.updatePreferences('user-1', { workoutEstimateEnabled: false });
    expect(prisma.profile.update.mock.calls[0][0].data).toMatchObject({ workoutEstimateEnabled: false, workoutAddToGoal: false });
  });
});

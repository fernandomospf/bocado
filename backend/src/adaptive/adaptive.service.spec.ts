import { BadRequestException, ConflictException } from '@nestjs/common';
import { formatDay } from '../common/dates';
import { addDays } from '../weight/weight.math';
import { AdaptiveService } from './adaptive.service';
import { DismissAction } from './dto/adaptive.dto';

// O serviço recusa datas futuras: usa o dia de hoje de verdade
const TODAY = formatDay(new Date());
const day = (i: number) => new Date(`${addDays(TODAY, -27 + i)}T00:00:00.000Z`);

const profile = {
  userId: 'user-1',
  sex: 'FEMALE',
  birthDate: new Date('1996-06-01T00:00:00Z'),
  heightCm: 165,
  weightKg: 70,
  activityLevel: 'MODERATE',
  goal: 'MAINTAIN',
  kcalTarget: 1900,
  proteinTarget: 112,
  carbsTarget: 230,
  fatTarget: 60,
  adaptiveEnabled: true,
  adaptiveSnoozedUntil: null,
};

/** 28 dias comendo 2.200 com peso estável: gasto 2.200; com meta de 1.900 a sugestão é 2.050 (passo de 150). */
function setup({ over = {}, lastDecision = null as Date | null, firstMeal = day(-13) as Date | null } = {}) {
  const prisma = {
    profile: {
      findUnique: jest.fn().mockResolvedValue({ ...profile, ...over }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...profile, ...over }),
      update: jest.fn().mockResolvedValue({}),
    },
    meal: {
      findMany: jest.fn().mockResolvedValue(Array.from({ length: 28 }, (_, i) => ({ date: day(i), items: [{ kcal: 1200 }, { kcal: 1000 }] }))),
      findFirst: jest.fn().mockResolvedValue(firstMeal ? { date: firstMeal } : null),
    },
    weightEntry: { findMany: jest.fn().mockResolvedValue(Array.from({ length: 28 }, (_, i) => ({ date: day(i), weightKg: 70 }))) },
    adaptiveAdjustment: {
      findFirst: jest.fn().mockResolvedValue(lastDecision ? { createdAt: lastDecision } : null),
      create: jest.fn().mockImplementation((args) => Promise.resolve(args)),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const profiles = { get: jest.fn().mockResolvedValue({ targets: { kcal: 2050 } }) };
  return { prisma, profiles, service: new AdaptiveService(prisma as never, profiles as never) };
}

// firstMeal padrão: day(-13) = 40 dias atrás
describe('AdaptiveService com o modo GLP-1', () => {
  it('a meta adaptativa fica pausada (nenhuma sugestão) e não dá para aplicar', async () => {
    const { service } = setup({ over: { glp1Mode: true } });
    expect(await service.status('user-1', TODAY)).toMatchObject({ enabled: false, state: 'disabled' });
    await expect(service.apply('user-1', { today: TODAY, expectedKcal: 2050 })).rejects.toBeInstanceOf(ConflictException);
  });
  it('sem o modo GLP-1 a sugestão continua igual', async () => {
    const { service } = setup({ over: { glp1Mode: false } });
    expect(await service.status('user-1', TODAY)).toMatchObject({ enabled: true, state: 'suggestion' });
  });
});

describe('AdaptiveService.status', () => {
  it('só lê os dados do usuário da sessão', async () => {
    const { service, prisma } = setup();
    const s = await service.status('user-1', TODAY);
    expect(s).toMatchObject({ enabled: true, state: 'suggestion', suggestion: { currentKcal: 1900, newKcal: 2050 } });
    expect(prisma.profile.findUnique).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    for (const model of [prisma.meal.findMany, prisma.weightEntry.findMany, prisma.meal.findFirst, prisma.adaptiveAdjustment.findFirst]) {
      expect(model.mock.calls[0][0].where.userId).toBe('user-1');
    }
  });

  it('não grava nada ao calcular', async () => {
    const { service, prisma } = setup();
    await service.status('user-1', TODAY);
    expect(prisma.adaptiveAdjustment.create).not.toHaveBeenCalled();
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });

  it('recusa data futura', async () => {
    const { service } = setup();
    await expect(service.status('user-1', addDays(TODAY, 5))).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uma decisão há menos de 14 dias deixa o estado em paused', async () => {
    const { service } = setup({ lastDecision: new Date(Date.now() - 3 * 86_400_000) });
    expect((await service.status('user-1', TODAY)).state).toBe('paused');
  });
});

describe('AdaptiveService.apply', () => {
  it('sugestão mudou (diferença > 20 kcal): 409 com a sugestão nova, e nada é gravado', async () => {
    const { service, prisma } = setup();
    const err = await service.apply('user-1', { today: TODAY, expectedKcal: 2000 }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse().status).toMatchObject({ state: 'suggestion', suggestion: { newKcal: 2050 } });
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.adaptiveAdjustment.create).not.toHaveBeenCalled();
  });

  it('até 20 kcal de diferença ainda vale; o servidor usa a SUA sugestão, não o número do cliente', async () => {
    const { service, prisma } = setup();
    await service.apply('user-1', { today: TODAY, expectedKcal: 2070 });
    expect(prisma.profile.update.mock.calls[0][0].data.kcalTarget).toBe(2050);
  });

  it('atualiza as metas com customTargets = true, grava APPLIED e devolve o perfil', async () => {
    const { service, prisma, profiles } = setup();
    const out = await service.apply('user-1', { today: TODAY, expectedKcal: 2050 });

    const update = prisma.profile.update.mock.calls[0][0];
    expect(update.where).toEqual({ userId: 'user-1' });
    expect(update.data).toMatchObject({ kcalTarget: 2050, proteinTarget: 112, customTargets: true, targetsWeightKg: 70 });
    expect(update.data.carbsTarget + 0).toBeGreaterThan(0);

    const log = prisma.adaptiveAdjustment.create.mock.calls[0][0].data;
    expect(log).toMatchObject({ userId: 'user-1', action: 'APPLIED', previousKcal: 1900, newKcal: 2050, confidence: 'HIGH', avgIntake: 2200, estimatedTdee: 2200 });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1); // metas e histórico juntos
    expect(profiles.get).toHaveBeenCalledWith('user-1');
    expect(out).toEqual({ targets: { kcal: 2050 } });
  });

  it('sem sugestão (por exemplo, pausado): 409 e nada é gravado', async () => {
    const { service, prisma } = setup({ lastDecision: new Date() });
    await expect(service.apply('user-1', { today: TODAY, expectedKcal: 2050 })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.profile.update).not.toHaveBeenCalled();
  });
});

describe('AdaptiveService.dismiss', () => {
  it('manter a minha: grava DISMISSED sem nova meta e pausa por 14 dias', async () => {
    const { service, prisma } = setup();
    const out = await service.dismiss('user-1', { today: TODAY });
    expect(out).toEqual({ snoozedUntil: addDays(TODAY, 14) });
    expect(prisma.adaptiveAdjustment.create.mock.calls[0][0].data).toMatchObject({ userId: 'user-1', action: 'DISMISSED', previousKcal: 1900, newKcal: null });
    expect(prisma.profile.update.mock.calls[0][0]).toMatchObject({
      where: { userId: 'user-1' },
      data: { adaptiveSnoozedUntil: new Date(`${addDays(TODAY, 14)}T00:00:00.000Z`) },
    });
  });

  it('lembrar depois: grava SNOOZED, com o prazo pedido', async () => {
    const { service, prisma } = setup();
    const out = await service.dismiss('user-1', { today: TODAY, action: DismissAction.SNOOZED, snoozeDays: 21 });
    expect(out.snoozedUntil).toBe(addDays(TODAY, 21));
    expect(prisma.adaptiveAdjustment.create.mock.calls[0][0].data.action).toBe('SNOOZED');
  });

  it('sem sugestão para dispensar: 400', async () => {
    const { service, prisma } = setup({ over: { adaptiveEnabled: false } });
    await expect(service.dismiss('user-1', { today: TODAY })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.adaptiveAdjustment.create).not.toHaveBeenCalled();
  });

  it('depois de dispensar, o status fica pausado', async () => {
    const { service } = setup({ over: { adaptiveSnoozedUntil: new Date(`${addDays(TODAY, 14)}T00:00:00.000Z`) } });
    expect(await service.status('user-1', TODAY)).toMatchObject({ state: 'paused', snoozedUntil: addDays(TODAY, 14) });
  });
});

describe('AdaptiveService.history', () => {
  it('lista só as decisões do usuário, da mais recente, com limite', async () => {
    const { service, prisma } = setup();
    prisma.adaptiveAdjustment.findMany.mockResolvedValue([
      { id: 'a1', createdAt: new Date(), action: 'APPLIED', previousKcal: 1900, newKcal: 2050, estimatedTdee: 2199.6, confidence: 'HIGH', windowStart: day(0), windowEnd: day(27) },
    ]);
    const out = await service.history('user-1', 5);
    expect(prisma.adaptiveAdjustment.findMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, orderBy: { createdAt: 'desc' }, take: 5 });
    expect(out[0]).toMatchObject({ action: 'APPLIED', previousKcal: 1900, newKcal: 2050, estimatedTdee: 2200 });
  });

  it('nunca passa de 50', async () => {
    const { service, prisma } = setup();
    await service.history('user-1', 999);
    expect(prisma.adaptiveAdjustment.findMany.mock.calls[0][0].take).toBe(50);
  });
});

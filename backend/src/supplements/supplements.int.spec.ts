import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AccountService } from '../account/account.service';
import { HouseholdService } from '../household/household.service';
import { latestAllowedDay } from '../meals/meals.service';
import type { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { addDays } from '../weight/weight.math';
import { SupplementsService } from './supplements.service';

/** Banco real (TEST_DATABASE_URL descartável): unicidade, cascata, `distinct`, isolamento na mesma casa. */
describeDb('Suplementos e medicações (banco real)', () => {
  let prisma: PrismaService;
  let service: SupplementsService;

  beforeAll(() => {
    prisma = createTestPrisma();
    service = new SupplementsService(prisma);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  const day = (n: number) => addDays(latestAllowedDay(), -n);
  const injectable = {
    name: 'Injetável semanal',
    category: 'MEDICATION' as const,
    administration: 'INJECTION' as const,
    doseAmount: 0.5,
    doseUnit: 'ML' as const,
    scheduleType: 'WEEKDAYS' as const,
    weekdays: [1],
    startDate: '2026-10-01',
    trackSite: true,
    showOnWeightChart: true,
  };

  it('unicidade (plano, dia e horário): o segundo registro é 409 e o primeiro continua', async () => {
    const u = await makeUser(prisma);
    const plan = await service.createPlan(u.id, injectable as never);
    await service.log(u.id, { planId: plan.id, date: day(1) } as never);
    await expect(service.log(u.id, { planId: plan.id, date: day(1) } as never)).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.intakeLog.count({ where: { userId: u.id } })).toBe(1);
    // outro horário do mesmo dia é outro registro; pular o mesmo dia e horário também é duplicado
    const twice = await service.createPlan(u.id, { ...injectable, name: 'Dois horários', slots: ['MORNING', 'NIGHT'] } as never);
    await service.log(u.id, { planId: twice.id, date: day(1), slot: 'MORNING' } as never);
    await service.skip(u.id, { planId: twice.id, date: day(1), slot: 'NIGHT' } as never);
    await expect(service.skip(u.id, { planId: twice.id, date: day(1), slot: 'MORNING' } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('snapshot da dose: editar o plano não muda o histórico (no banco)', async () => {
    const u = await makeUser(prisma);
    const plan = await service.createPlan(u.id, { ...injectable, doseAmount: 0.25 } as never);
    const first = await service.log(u.id, { planId: plan.id, date: day(2) } as never);
    await service.updatePlan(u.id, plan.id, { doseAmount: 2, doseUnit: 'MG' } as never);
    const stored = await prisma.intakeLog.findUniqueOrThrow({ where: { id: first.id } });
    expect([stored.doseAmount, stored.doseUnit]).toEqual([0.25, 'ML']);
  });

  it('apagar o plano apaga o histórico; arquivar mantém', async () => {
    const u = await makeUser(prisma);
    const keep = await service.createPlan(u.id, injectable as never);
    const drop = await service.createPlan(u.id, { ...injectable, name: 'Apagar' } as never);
    await service.log(u.id, { planId: keep.id, date: day(1) } as never);
    await service.log(u.id, { planId: drop.id, date: day(1) } as never);
    await service.archive(u.id, keep.id);
    expect(await prisma.intakeLog.count({ where: { planId: keep.id } })).toBe(1);
    await service.deletePlan(u.id, drop.id);
    expect(await prisma.intakeLog.count({ where: { planId: drop.id } })).toBe(0);
    expect(await prisma.supplementPlan.count({ where: { id: drop.id } })).toBe(0);
  });

  it('excluir a conta apaga planos e registros por cascata (e só os dela)', async () => {
    const a = await makeUser(prisma, 'Ana');
    const b = await makeUser(prisma, 'Bia');
    const pa = await service.createPlan(a.id, injectable as never);
    const pb = await service.createPlan(b.id, injectable as never);
    await service.log(a.id, { planId: pa.id, date: day(1) } as never);
    await service.log(b.id, { planId: pb.id, date: day(1) } as never);
    await new AccountService(prisma).deleteAccount(a.id, { confirmation: 'EXCLUIR' });
    expect(await prisma.supplementPlan.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.intakeLog.count({ where: { userId: a.id } })).toBe(0);
    expect(await prisma.supplementPlan.count({ where: { userId: b.id } })).toBe(1);
    expect(await prisma.intakeLog.count({ where: { userId: b.id } })).toBe(1);
  });

  it('casa: quem divide a casa não vê plano, registro, marcador, histórico nem calendário do outro', async () => {
    const a = await makeUser(prisma, 'Ana');
    const b = await makeUser(prisma, 'Bia');
    const config = { getOrThrow: () => 'https://bocado.test' } as unknown as ConfigService;
    const house = new HouseholdService(prisma, config);
    await house.create(a.id, 'Casa da Ana');
    await house.join(b.id, (await house.createInvite(a.id)).code);
    expect((await house.get(b.id))?.members).toHaveLength(2);

    const plan = await service.createPlan(a.id, { ...injectable, name: 'Reservado da Ana' } as never);
    const log = await service.log(a.id, { planId: plan.id, date: day(1) } as never);

    // A Bia, na mesma casa, não enxerga nada
    expect((await service.listPlans(b.id, {})).plans).toEqual([]);
    expect((await service.day(b.id, day(0))).items).toEqual([]);
    expect((await service.history(b.id, { from: day(5), to: day(0) })).logs).toEqual([]);
    expect(await service.weightMarkers(b.id, { from: day(5), to: day(0) })).toEqual([]);
    const attempts: (() => Promise<unknown>)[] = [
      () => service.history(b.id, { planId: plan.id, from: day(5), to: day(0) }),
      () => service.updatePlan(b.id, plan.id, { name: 'x' } as never),
      () => service.deletePlan(b.id, plan.id),
      () => service.archive(b.id, plan.id),
      () => service.log(b.id, { planId: plan.id, date: day(0) } as never),
      () => service.updateLog(b.id, log.id, { note: 'x' } as never),
      () => service.deleteLog(b.id, log.id),
      () => service.calendar(b.id, plan.id, { time: '08:00' } as never),
    ];
    for (const attempt of attempts) await expect(attempt()).rejects.toBeInstanceOf(NotFoundException);

    // Nenhuma superfície da casa ou das receitas carrega o módulo
    const recipes = new RecipesService(prisma);
    const surfaces = JSON.stringify([await house.get(a.id), await house.get(b.id), await house.listInvites(a.id), await recipes.list(b.id), await prisma.sharedMealOffer.findMany()]);
    expect(surfaces).not.toMatch(/Reservado da Ana|supplement|intake/i);
    // ...e o dono continua com tudo
    expect((await service.listPlans(a.id, {})).plans).toHaveLength(1);
  });

  it('marcadores do gráfico: só planos marcados e registros TAKEN; o distinct do local sugerido pega o último de cada plano', async () => {
    const u = await makeUser(prisma);
    const marked = await service.createPlan(u.id, injectable as never);
    const plain = await service.createPlan(u.id, { ...injectable, name: 'Sem marcador', showOnWeightChart: false } as never);
    await service.log(u.id, { planId: marked.id, date: day(9), site: 'ABDOMEN_L' } as never);
    await service.log(u.id, { planId: marked.id, date: day(2), site: 'THIGH_R' } as never);
    await service.skip(u.id, { planId: marked.id, date: day(1) } as never);
    await service.log(u.id, { planId: plain.id, date: day(2), site: 'DELTOID_L' } as never);
    expect(await service.weightMarkers(u.id, { from: day(20), to: day(0) })).toEqual([
      { date: day(9), planId: marked.id, label: 'Injetável semanal' },
      { date: day(2), planId: marked.id, label: 'Injetável semanal' },
    ]);
    const res = await service.day(u.id, day(0));
    expect(res.suggestedSites).toEqual({ [marked.id]: 'GLUTE_L', [plain.id]: 'DELTOID_R' });
  });

  it('limite de 30 itens ativos no banco', async () => {
    const u = await makeUser(prisma);
    for (let i = 0; i < 30; i++) await service.createPlan(u.id, { ...injectable, name: `Item ${i}` } as never);
    await expect(service.createPlan(u.id, injectable as never)).rejects.toBeInstanceOf(ConflictException);
  });
});

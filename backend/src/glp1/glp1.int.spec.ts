import { ForbiddenException } from '@nestjs/common';
import { formatDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { addDays } from '../weight/weight.math';
import { assertHealthAccess } from './glp1.access';
import { Glp1Service } from './glp1.service';
import { WellbeingService } from './wellbeing.service';

/** Banco real (TEST_DATABASE_URL descartável): posse, unicidade, isolamento, menores de 18 e cascata. */
describeDb('Modo GLP-1 e bem-estar (banco real)', () => {
  let prisma: PrismaService;
  let wellbeing: WellbeingService;
  let glp1: Glp1Service;
  let profiles: ProfileService;

  beforeAll(() => {
    prisma = createTestPrisma();
    wellbeing = new WellbeingService(prisma);
    glp1 = new Glp1Service(prisma);
    profiles = new ProfileService(prisma);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  const today = () => formatDay(new Date());
  const profile = (userId: string, over: Record<string, unknown> = {}) =>
    prisma.profile.create({
      data: {
        userId,
        sex: 'FEMALE',
        birthDate: new Date('1990-01-01T00:00:00Z'),
        heightCm: 165,
        weightKg: 80,
        activityLevel: 'MODERATE',
        goal: 'LOSE',
        kcalTarget: 1700,
        proteinTarget: 100,
        carbsTarget: 180,
        fatTarget: 55,
        ...over,
      },
    });

  it('só funciona com GLP-1 ou suplementos ligados; os dois desligados = 403 neutro', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    await expect(assertHealthAccess(prisma, u.id, ['glp1Mode', 'supplementsEnabled'])).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.profile.update({ where: { userId: u.id }, data: { supplementsEnabled: true } });
    await expect(assertHealthAccess(prisma, u.id, ['glp1Mode', 'supplementsEnabled'])).resolves.toBeUndefined();
    // GLP-1 exige o GLP-1 mesmo (só suplementos não basta para o resumo)
    await expect(assertHealthAccess(prisma, u.id, ['glp1Mode'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('menor de 18 anos: 403 neutro mesmo com a preferência ligada; não consegue ligar o modo', async () => {
    const u = await makeUser(prisma);
    const young = new Date(Date.now() - 16 * 365.25 * 86_400_000);
    await profile(u.id, { birthDate: young });
    await expect(profiles.updatePreferences(u.id, { glp1Mode: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(profiles.updatePreferences(u.id, { proteinFloorG: 100 })).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.profile.update({ where: { userId: u.id }, data: { glp1Mode: true } }); // estado forçado
    await expect(assertHealthAccess(prisma, u.id, ['glp1Mode'])).rejects.toThrow('menores de 18');
  });

  it('piso de proteína: sugestão pela tendência de peso, editável e que volta ao ser limpo', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { proteinTarget: 80, weightKg: 100 });
    const on = await profiles.updatePreferences(u.id, { glp1Mode: true });
    expect(on).toMatchObject({ glp1Mode: true, proteinFloorG: 120, proteinFloorSuggestion: 120 }); // 1,2 x 100
    const edited = await profiles.updatePreferences(u.id, { proteinFloorG: 140 });
    expect(edited).toMatchObject({ proteinFloorG: 140, proteinFloorSuggestion: 120 });
    const cleared = await profiles.updatePreferences(u.id, { proteinFloorG: null });
    expect(cleared.proteinFloorG).toBe(120);
    const off = await profiles.updatePreferences(u.id, { glp1Mode: false });
    expect(off).toMatchObject({ glp1Mode: false, proteinFloorG: null });
  });

  it('bem-estar: uma linha por dia (upsert), PUT parcial preserva o resto e tudo em branco apaga', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { glp1Mode: true });
    const d = today();
    await wellbeing.put(u.id, d, { nausea: 1, energy: 2, note: ' dia corrido ' });
    const second = await wellbeing.put(u.id, d, { appetite: 3 });
    expect(second).toMatchObject({ nausea: 1, energy: 2, appetite: 3, gi: null, note: 'dia corrido' });
    expect(await prisma.wellbeingLog.count({ where: { userId: u.id } })).toBe(1);

    await wellbeing.put(u.id, d, { nausea: null, appetite: null, energy: null, gi: null, note: null });
    expect(await prisma.wellbeingLog.count({ where: { userId: u.id } })).toBe(0);
    expect(await wellbeing.get(u.id, d)).toMatchObject({ nausea: null, note: null });
  });

  it('isolamento: o bem-estar de uma pessoa não aparece para outra (nem no período)', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    await profile(a.id, { glp1Mode: true });
    await profile(b.id, { glp1Mode: true });
    const d = today();
    await wellbeing.put(a.id, d, { nausea: 3, note: 'segredo' });
    expect(await wellbeing.get(b.id, d)).toMatchObject({ nausea: null, note: null });
    expect((await wellbeing.range(b.id, addDays(d, -7), d)).days).toEqual([]);
    expect((await wellbeing.range(a.id, addDays(d, -7), d)).days).toHaveLength(1);
  });

  it('dia futuro é recusado; período maior que 92 dias também', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { glp1Mode: true });
    await expect(wellbeing.put(u.id, addDays(latestAllowedDay(), 2), { nausea: 1 })).rejects.toThrow();
    await expect(wellbeing.range(u.id, addDays(today(), -200), today())).rejects.toThrow();
  });

  it('"dia N desde a última aplicação" só com suplementos ligados e plano injetável', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { glp1Mode: true });
    const plan = await prisma.supplementPlan.create({
      data: {
        userId: u.id, name: 'Injetável', category: 'MEDICATION', administration: 'INJECTION', doseAmount: 1, doseUnit: 'MG',
        scheduleType: 'EVERY_N_DAYS', intervalDays: 7, startDate: new Date('2026-01-01T00:00:00Z'),
      },
    });
    const dose = addDays(today(), -2);
    await prisma.intakeLog.create({
      data: { userId: u.id, planId: plan.id, date: new Date(`${dose}T00:00:00Z`), status: 'TAKEN', takenAt: new Date(), doseAmount: 1, doseUnit: 'MG' },
    });
    expect((await wellbeing.get(u.id, today())).dayOfCycle).toBeNull(); // módulo desligado
    await prisma.profile.update({ where: { userId: u.id }, data: { supplementsEnabled: true } });
    expect((await wellbeing.get(u.id, today())).dayOfCycle).toBe(3); // o dia da aplicação é o dia 1
    expect((await wellbeing.get(u.id, dose)).dayOfCycle).toBe(1);
  });

  it('aviso de baixa ingestão dispara e não dispara com dados reais', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { glp1Mode: true });
    const meal = (date: string, kcal: number) =>
      prisma.meal.create({
        data: { userId: u.id, date: new Date(`${date}T00:00:00Z`), type: 'LUNCH', items: { create: { name: 'x', grams: 100, kcal, protein: 10, carbs: 10, fat: 1 } } },
      });
    expect((await glp1.summary(u.id, today())).lowIntake).toBe(false); // sem registro
    for (let i = 0; i < 5; i++) await meal(addDays(today(), -i), 900);
    expect((await glp1.summary(u.id, today())).lowIntake).toBe(true);
    await prisma.meal.deleteMany({ where: { userId: u.id } });
    for (let i = 0; i < 5; i++) await meal(addDays(today(), -i), 1500);
    expect((await glp1.summary(u.id, today())).lowIntake).toBe(false);
  });
});

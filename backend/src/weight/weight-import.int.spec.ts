import { BadRequestException, NotFoundException } from '@nestjs/common';
import { formatDay, parseDay } from '../common/dates';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { WaterService } from '../water/water.service';
import { WeightService } from './weight.service';
import { addDays } from './weight.math';

/** Banco real: keep/replace, lotes, desfazer, posse e o efeito no peso do perfil. */
describeDb('Importar histórico de peso (banco real)', () => {
  let prisma: PrismaService;
  let weight: WeightService;
  let recalc: jest.Mock;

  beforeAll(() => {
    prisma = createTestPrisma();
    recalc = jest.fn().mockResolvedValue(undefined);
    weight = new WeightService(prisma, { recalcToday: recalc, recalcAround: jest.fn() } as unknown as WaterService);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await cleanDb(prisma);
    recalc.mockClear();
  });

  const today = formatDay(new Date());
  const d = (n: number) => addDays(today, -n);
  const profile = (userId: string, weightKg = 90) =>
    prisma.profile.create({
      data: { userId, sex: 'MALE', birthDate: new Date('1990-01-01T00:00:00Z'), heightCm: 180, weightKg, activityLevel: 'MODERATE', goal: 'LOSE', kcalTarget: 2200, proteinTarget: 140, carbsTarget: 250, fatTarget: 70 },
    });
  const rows = (userId: string) => prisma.weightEntry.findMany({ where: { userId }, orderBy: { date: 'asc' } });
  const entries = (...pairs: [number, number][]) => pairs.map(([ago, kg]) => ({ date: d(ago), weightKg: kg }));

  it('importa, liga os registros ao import e recalcula a água de hoje', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const res = await weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([10, 88], [9, 87.5], [8, 87]) });
    expect(res).toMatchObject({ created: 3, replaced: 0, kept: 0, received: 3 });
    expect((await rows(u.id)).every((r) => r.importId === res.importId)).toBe(true);
    expect((await prisma.weightImport.findUniqueOrThrow({ where: { id: res.importId } })).count).toBe(3);
    expect(recalc).toHaveBeenCalledWith(u.id, expect.any(Date));
  });

  it('"keep" mantém os registros existentes; "replace" troca o valor (a nota fica)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    await prisma.weightEntry.create({ data: { userId: u.id, date: parseDay(d(5)), weightKg: 85, note: 'minha' } });

    const keep = await weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([5, 99], [6, 86]) });
    expect(keep).toMatchObject({ created: 1, kept: 1 });
    expect((await rows(u.id)).find((r) => formatDay(r.date) === d(5))?.weightKg).toBe(85);

    const replace = await weight.importBatch(u.id, { source: 'CSV', conflict: 'replace', entries: entries([5, 99], [7, 87]) });
    expect(replace).toMatchObject({ created: 1, replaced: 1 });
    const five = (await rows(u.id)).find((r) => formatDay(r.date) === d(5))!;
    expect(five).toMatchObject({ weightKg: 99, note: 'minha', importId: null }); // substituído: continua do usuário
  });

  it('vários lotes do mesmo import somam a contagem; importId alheio é 404', async () => {
    const u = await makeUser(prisma);
    const other = await makeUser(prisma);
    await profile(u.id);
    await profile(other.id);
    const first = await weight.importBatch(u.id, { source: 'APPLE_HEALTH', conflict: 'keep', entries: entries([30, 90], [29, 89]) });
    const second = await weight.importBatch(u.id, { source: 'APPLE_HEALTH', conflict: 'keep', importId: first.importId, entries: entries([28, 88]) });
    expect(second.importId).toBe(first.importId);
    expect((await prisma.weightImport.findUniqueOrThrow({ where: { id: first.importId } })).count).toBe(3);
    await expect(weight.importBatch(other.id, { source: 'APPLE_HEALTH', conflict: 'keep', importId: first.importId, entries: entries([1, 80]) })).rejects.toBeInstanceOf(NotFoundException);
    // origem diferente do import também não vale
    await expect(weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', importId: first.importId, entries: entries([1, 80]) })).rejects.toBeInstanceOf(NotFoundException);
  });

  it('descarta valores fora de 30 a 350 kg e datas futuras (e recusa o lote todo inválido)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const res = await weight.importBatch(u.id, {
      source: 'CSV',
      conflict: 'keep',
      entries: [...entries([3, 80], [2, 20], [1, 400]), { date: addDays(today, 5), weightKg: 80 }],
    });
    expect(res).toMatchObject({ created: 1, received: 4, discarded: { outOfRange: 2, futureDate: 1 } });
    await expect(weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([1, 5]) })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('Profile.weightKg: acompanha só se a data mais recente importada não for anterior ao último registro', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, 90);
    await prisma.weightEntry.create({ data: { userId: u.id, date: parseDay(d(2)), weightKg: 85 } });
    // histórico antigo: o perfil não muda
    await weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([40, 95], [30, 94]) });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).weightKg).toBe(90);
    // registro mais recente que o último: o perfil acompanha
    await weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([0, 83.4]) });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).weightKg).toBe(83.4);
  });

  it('desfazer apaga só o que o import criou; os substituídos não voltam; e atualiza o perfil', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, 90);
    await prisma.weightEntry.create({ data: { userId: u.id, date: parseDay(d(20)), weightKg: 91 } });
    const res = await weight.importBatch(u.id, { source: 'CSV', conflict: 'replace', entries: entries([20, 70], [3, 82], [1, 81]) });
    expect(res).toMatchObject({ created: 2, replaced: 1 });
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).weightKg).toBe(81);

    expect(await weight.undoImport(u.id, res.importId)).toEqual({ deleted: 2 });
    const left = await rows(u.id);
    expect(left.map((r) => [formatDay(r.date), r.weightKg])).toEqual([[d(20), 70]]); // o substituído ficou com o valor importado
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).weightKg).toBe(70);
    expect(await prisma.weightImport.count({ where: { userId: u.id } })).toBe(0);
    expect(await weight.listImports(u.id)).toEqual([]);
  });

  it('posse: outra pessoa não vê nem desfaz a importação', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    await profile(a.id);
    await profile(b.id);
    const res = await weight.importBatch(a.id, { source: 'CSV', conflict: 'keep', entries: entries([3, 80]) });
    expect(await weight.listImports(b.id)).toEqual([]);
    expect(await weight.listImports(a.id)).toMatchObject([{ id: res.importId, source: 'CSV', count: 1 }]);
    await expect(weight.undoImport(b.id, res.importId)).rejects.toBeInstanceOf(NotFoundException);
    expect(await rows(a.id)).toHaveLength(1);
  });

  it('excluir a conta apaga as importações (Cascade)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    await weight.importBatch(u.id, { source: 'CSV', conflict: 'keep', entries: entries([3, 80]) });
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.weightImport.count({ where: { userId: u.id } })).toBe(0);
  });
});

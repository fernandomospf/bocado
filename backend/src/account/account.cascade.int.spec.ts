import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { AccountService } from './account.service';

/** Banco real: excluir a conta apaga bem-estar, jejum e confirmações do acervo (Cascade), sem tocar nos dados dos outros. */
describeDb('Exclusão de conta: dados novos (banco real)', () => {
  let prisma: PrismaService;
  let account: AccountService;
  beforeAll(() => {
    prisma = createTestPrisma();
    account = new AccountService(prisma);
  });
  afterAll(async () => {
    await prisma.food.deleteMany({ where: { name: { startsWith: 'TESTE ' } } });
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.food.deleteMany({ where: { name: { startsWith: 'TESTE ' } } });
    await cleanDb(prisma);
  });

  it('apaga WellbeingLog, FastingSession e FoodConfirmation da pessoa e só dela', async () => {
    const gone = await makeUser(prisma);
    const stays = await makeUser(prisma);
    const food = await prisma.food.create({
      data: { source: 'LABEL', name: 'TESTE Produto', searchName: 'teste produto', kcal100: 100, protein100: 1, carbs100: 20, fat100: 1, verifyCount: 2 },
    });
    for (const u of [gone, stays]) {
      await prisma.wellbeingLog.create({ data: { userId: u.id, date: new Date('2026-11-18T00:00:00Z'), nausea: 1, note: 'nota' } });
      await prisma.fastingSession.create({ data: { userId: u.id, startedAt: new Date('2026-11-18T20:00:00Z'), endedAt: new Date('2026-11-19T10:00:00Z'), targetHours: 16 } });
      await prisma.foodConfirmation.create({ data: { foodId: food.id, userId: u.id } });
    }

    await account.deleteAccount(gone.id, { confirmation: 'EXCLUIR' });

    expect(await prisma.wellbeingLog.count({ where: { userId: gone.id } })).toBe(0);
    expect(await prisma.fastingSession.count({ where: { userId: gone.id } })).toBe(0);
    expect(await prisma.foodConfirmation.count({ where: { userId: gone.id } })).toBe(0);
    // Os da outra pessoa continuam, e o produto do acervo também
    expect(await prisma.wellbeingLog.count({ where: { userId: stays.id } })).toBe(1);
    expect(await prisma.fastingSession.count({ where: { userId: stays.id } })).toBe(1);
    expect(await prisma.foodConfirmation.count({ where: { userId: stays.id } })).toBe(1);
    expect(await prisma.food.count({ where: { id: food.id } })).toBe(1);
  });
});

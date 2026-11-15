import { BadRequestException, ConflictException, GoneException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { MealSnapshotDto } from './dto/meal.dto';
import { MealsService, RESTORE_WINDOW_MS } from './meals.service';

const MEAL_ID = '11111111-1111-4111-8111-111111111111';
const ITEM_A = '22222222-2222-4222-8222-222222222222';
const ITEM_B = '33333333-3333-4333-8333-333333333333';
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const row = (id: string, name: string) => ({ id, mealId: MEAL_ID, name, grams: 100, kcal: 120, protein: 3, carbs: 20, fat: 2, estimated: false });
const mealRow = { id: MEAL_ID, userId: 'user-1', date: day('2026-11-14'), type: 'LUNCH', source: 'PHOTO', note: 'almoço', createdAt: new Date('2026-11-14T15:00:00Z') };

function snapshot(over: Partial<MealSnapshotDto> = {}): MealSnapshotDto {
  return {
    meal: { id: MEAL_ID, date: '2026-11-14', type: 'LUNCH', source: 'PHOTO', note: 'almoço', createdAt: '2026-11-14T15:00:00.000Z' },
    items: [
      { id: ITEM_A, name: 'Arroz', grams: 100, kcal: 120, protein: 3, carbs: 20, fat: 2, estimated: true },
      { id: ITEM_B, name: 'Feijão', grams: 100, kcal: 76, protein: 5, carbs: 14, fat: 0.5 },
    ],
    mealDeleted: true,
    deletedAt: new Date().toISOString(),
    ...over,
  } as MealSnapshotDto;
}

function setup({ existingMeal = null as object | null, ownedMeal = null as object | null, clashes = 0 } = {}) {
  const tx = {
    meal: {
      findUnique: jest.fn().mockResolvedValue(existingMeal),
      findFirst: jest.fn().mockResolvedValue(ownedMeal),
      create: jest.fn(),
      delete: jest.fn(),
    },
    mealItem: { count: jest.fn().mockResolvedValue(clashes), createMany: jest.fn(), delete: jest.fn() },
  };
  const prisma = {
    meal: { findFirst: jest.fn(), delete: jest.fn() },
    mealItem: { findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx, service: new MealsService(prisma as never, {} as never) };
}

describe('MealsService.restore', () => {
  it('refeição inteira: recria com o MESMO id e os itens com os mesmos ids', async () => {
    const { service, tx } = setup();
    const out = await service.restore('user-1', snapshot());

    expect(tx.meal.create).toHaveBeenCalledWith({
      data: {
        id: MEAL_ID,
        userId: 'user-1',
        date: day('2026-11-14'),
        type: 'LUNCH',
        source: 'PHOTO',
        note: 'almoço',
        createdAt: new Date('2026-11-14T15:00:00.000Z'),
      },
    });
    const data = tx.mealItem.createMany.mock.calls[0][0].data;
    expect(data.map((i: { id: string }) => i.id)).toEqual([ITEM_A, ITEM_B]);
    expect(data.every((i: { mealId: string }) => i.mealId === MEAL_ID)).toBe(true);
    expect(data.map((i: { estimated: boolean }) => i.estimated)).toEqual([true, false]);
    expect(out).toEqual({ mealId: MEAL_ID, date: '2026-11-14' });
  });

  it('só itens: volta para a refeição existente do usuário, sem recriá-la', async () => {
    const { service, tx } = setup({ ownedMeal: mealRow });
    const out = await service.restore('user-1', snapshot({ mealDeleted: false, items: [snapshot().items[0]] }));

    expect(tx.meal.findFirst).toHaveBeenCalledWith({ where: { id: MEAL_ID, userId: 'user-1' } });
    expect(tx.meal.create).not.toHaveBeenCalled();
    expect(tx.mealItem.createMany.mock.calls[0][0].data).toHaveLength(1);
    expect(out).toEqual({ mealId: MEAL_ID, date: '2026-11-14' });
  });

  it('só itens: refeição inexistente ou de outro usuário → 404', async () => {
    const { service, tx } = setup({ ownedMeal: null });
    await expect(service.restore('user-2', snapshot({ mealDeleted: false }))).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.mealItem.createMany).not.toHaveBeenCalled();
  });

  it('o dono vem da sessão, mesmo que o snapshot traga outro userId', async () => {
    const { service, tx } = setup();
    const forged = snapshot();
    (forged.meal as unknown as Record<string, unknown>).userId = 'vitima';
    (forged as unknown as Record<string, unknown>).userId = 'vitima';
    await service.restore('user-1', forged);
    expect(tx.meal.create.mock.calls[0][0].data.userId).toBe('user-1');
    expect(JSON.stringify(tx.mealItem.createMany.mock.calls[0][0].data)).not.toContain('vitima');
  });

  it('id que já existe → 409 (refeição ou item), sem criar nada', async () => {
    const meal = setup({ existingMeal: { id: MEAL_ID } });
    await expect(meal.service.restore('user-1', snapshot())).rejects.toBeInstanceOf(ConflictException);
    expect(meal.tx.meal.create).not.toHaveBeenCalled();

    const item = setup({ clashes: 1 });
    await expect(item.service.restore('user-1', snapshot())).rejects.toBeInstanceOf(ConflictException);
    expect(item.tx.mealItem.createMany).not.toHaveBeenCalled();
  });

  it('corrida entre dois "Desfazer" (P2002 no banco) também vira 409', async () => {
    const { service, tx } = setup();
    tx.mealItem.createMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(service.restore('user-1', snapshot())).rejects.toBeInstanceOf(ConflictException);
  });

  it('snapshot com mais de 10 minutos → 410, sem tocar no banco', async () => {
    const { service, prisma } = setup();
    const old = new Date(Date.now() - RESTORE_WINDOW_MS - 1000).toISOString();
    await expect(service.restore('user-1', snapshot({ deletedAt: old }))).rejects.toBeInstanceOf(GoneException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletedAt no futuro ou ids repetidos → 400', async () => {
    const { service } = setup();
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    await expect(service.restore('user-1', snapshot({ deletedAt: future }))).rejects.toBeInstanceOf(BadRequestException);
    const s = snapshot();
    s.items[1].id = ITEM_A;
    await expect(service.restore('user-1', s)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DELETE devolve o snapshot', () => {
  it('apagar a refeição: todos os itens e mealDeleted = true', async () => {
    const { service, prisma } = setup();
    prisma.meal.findFirst.mockResolvedValue({ ...mealRow, items: [row(ITEM_A, 'Arroz'), row(ITEM_B, 'Feijão')] });
    const snap = await service.remove('user-1', MEAL_ID);
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: MEAL_ID, userId: 'user-1' }, include: { items: true } });
    expect(snap.mealDeleted).toBe(true);
    expect(snap.meal).toEqual({ id: MEAL_ID, date: '2026-11-14', type: 'LUNCH', source: 'PHOTO', note: 'almoço', createdAt: '2026-11-14T15:00:00.000Z' });
    expect(snap.items.map((i) => i.id)).toEqual([ITEM_A, ITEM_B]);
    expect(snap.items[0]).not.toHaveProperty('mealId');
    expect(Date.now() - Date.parse(snap.deletedAt)).toBeLessThan(5000);
  });

  it('apagar um item: mealDeleted só quando era o último', async () => {
    for (const [left, deleted] of [[1, false], [0, true]] as const) {
      const { service, prisma, tx } = setup();
      prisma.mealItem.findFirst.mockResolvedValue({ ...row(ITEM_A, 'Arroz'), meal: mealRow });
      tx.mealItem.count.mockResolvedValue(left);
      const snap = await service.removeItem('user-1', MEAL_ID, ITEM_A);
      expect(snap.mealDeleted).toBe(deleted);
      expect(snap.items).toHaveLength(1);
      expect(tx.meal.delete).toHaveBeenCalledTimes(deleted ? 1 : 0);
    }
  });

  it('item de outro usuário → 404', async () => {
    const { service, prisma } = setup();
    prisma.mealItem.findFirst.mockResolvedValue(null);
    await expect(service.removeItem('user-2', MEAL_ID, ITEM_A)).rejects.toBeInstanceOf(NotFoundException);
  });
});

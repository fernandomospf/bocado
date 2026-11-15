import { BadRequestException, NotFoundException } from '@nestjs/common';
import { latestAllowedDay, MealsService } from './meals.service';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const source = { id: 'meal-src', userId: 'user-1', date: day('2026-11-10'), type: 'LUNCH', source: 'PHOTO', createdAt: new Date() };

function setup({ target = null as object | null, left = 1, ownedItem = true, ownedMeal = true } = {}) {
  const tx = {
    meal: {
      findFirst: jest.fn().mockResolvedValue(target),
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'meal-new', ...data })),
      delete: jest.fn(),
    },
    mealItem: { update: jest.fn(), count: jest.fn().mockResolvedValue(left) },
  };
  const prisma = {
    meal: { findFirst: jest.fn().mockResolvedValue(ownedMeal ? source : null) },
    mealItem: { findFirst: jest.fn().mockResolvedValue(ownedItem ? { id: 'item-1', mealId: 'meal-src' } : null) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx, service: new MealsService(prisma as never, {} as never) };
}

describe('MealsService.moveItem', () => {
  it('mesma data, outro tipo: vai para a refeição existente desse tipo', async () => {
    const { service, tx } = setup({ target: { id: 'meal-snack' } });
    const out = await service.moveItem('user-1', 'meal-src', 'item-1', { type: 'SNACK', date: '2026-11-10' });

    expect(tx.meal.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', type: 'SNACK', date: day('2026-11-10'), id: { not: 'meal-src' } },
      orderBy: { createdAt: 'asc' },
    });
    expect(tx.meal.create).not.toHaveBeenCalled();
    expect(tx.mealItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { mealId: 'meal-snack' } });
    expect(out).toEqual({ fromDate: '2026-11-10', toDate: '2026-11-10', mealId: 'meal-snack' });
  });

  it('outra data sem refeição de destino: cria uma nova com a mesma origem', async () => {
    const { service, tx } = setup();
    const out = await service.moveItem('user-1', 'meal-src', 'item-1', { type: 'LUNCH', date: '2026-11-09' });

    expect(tx.meal.create).toHaveBeenCalledWith({
      data: { userId: 'user-1', type: 'LUNCH', date: day('2026-11-09'), source: 'PHOTO' },
    });
    expect(tx.mealItem.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { mealId: 'meal-new' } });
    expect(out).toEqual({ fromDate: '2026-11-10', toDate: '2026-11-09', mealId: 'meal-new' });
  });

  it('apaga a refeição de origem quando ela fica vazia; mantém se ainda tem itens', async () => {
    const empty = setup({ target: { id: 'meal-x' }, left: 0 });
    await empty.service.moveItem('user-1', 'meal-src', 'item-1', { type: 'DINNER', date: '2026-11-10' });
    expect(empty.tx.meal.delete).toHaveBeenCalledWith({ where: { id: 'meal-src' } });

    const notEmpty = setup({ target: { id: 'meal-x' }, left: 2 });
    await notEmpty.service.moveItem('user-1', 'meal-src', 'item-1', { type: 'DINNER', date: '2026-11-10' });
    expect(notEmpty.tx.meal.delete).not.toHaveBeenCalled();
  });

  it('tudo dentro de uma transação', async () => {
    const { service, prisma } = setup();
    await service.moveItem('user-1', 'meal-src', 'item-1', { type: 'DINNER', date: '2026-11-10' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('mesmo tipo e mesma data: não faz nada', async () => {
    const { service, prisma } = setup();
    const out = await service.moveItem('user-1', 'meal-src', 'item-1', { type: 'LUNCH', date: '2026-11-10' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(out).toEqual({ fromDate: '2026-11-10', toDate: '2026-11-10', mealId: 'meal-src' });
  });

  it('item ou refeição de outro usuário: 404, sem mexer em nada', async () => {
    const item = setup({ ownedItem: false });
    await expect(item.service.moveItem('user-2', 'meal-src', 'item-1', { type: 'SNACK', date: '2026-11-10' })).rejects.toBeInstanceOf(NotFoundException);
    expect(item.prisma.$transaction).not.toHaveBeenCalled();

    const meal = setup({ ownedMeal: false });
    await expect(meal.service.moveItem('user-2', 'meal-src', 'item-1', { type: 'SNACK', date: '2026-11-10' })).rejects.toBeInstanceOf(NotFoundException);
    expect(meal.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('data futura é rejeitada antes de qualquer consulta', async () => {
    const { service, prisma } = setup();
    await expect(service.moveItem('user-1', 'meal-src', 'item-1', { type: 'SNACK', date: '2999-01-01' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.mealItem.findFirst).not.toHaveBeenCalled();
  });
});

describe('latestAllowedDay', () => {
  it('aceita até a data de hoje no fuso UTC+14', () => {
    expect(latestAllowedDay(new Date('2026-11-15T09:00:00Z'))).toBe('2026-11-15');
    expect(latestAllowedDay(new Date('2026-11-15T10:00:00Z'))).toBe('2026-11-16');
  });
});

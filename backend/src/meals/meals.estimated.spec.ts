import { MealsService } from './meals.service';

function setup() {
  const prisma = {
    meal: { create: jest.fn() },
    mealItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'item-1', mealId: 'meal-1' }),
      update: jest.fn().mockImplementation(({ data }) => ({ id: 'item-1', ...data })),
    },
  };
  return { prisma, service: new MealsService(prisma as never, {} as never) };
}

const item = (extra: object = {}) => ({ name: 'Arroz', grams: 150, kcal: 190, protein: 4, carbs: 42, fat: 0.3, ...extra });

describe('MealItem.estimated', () => {
  it('itens vindos da análise são criados com estimated = true; os outros, sem o campo (padrão false)', async () => {
    const { prisma, service } = setup();
    prisma.meal.create.mockImplementation(({ data }) => ({
      id: 'meal-1',
      date: new Date('2026-11-15T00:00:00Z'),
      type: data.type,
      source: data.source,
      note: null,
      createdAt: new Date(),
      items: data.items.create.map((i: object, n: number) => ({ id: `i${n}`, mealId: 'meal-1', estimated: false, ...i })),
    }));

    const meal = await service.create('user-1', {
      date: '2026-11-15',
      type: 'LUNCH',
      source: 'PHOTO',
      items: [item({ estimated: true }), item({ name: 'Gordura de preparo (óleo, 1 colher de chá)' })],
    });

    const created = prisma.meal.create.mock.calls[0][0].data.items.create;
    expect(created[0].estimated).toBe(true);
    expect(created[1].estimated).toBeUndefined();
    expect(meal.items.map((i) => i.estimated)).toEqual([true, false]);
  });

  it('editar porção ou macros depois de salvo zera estimated', async () => {
    const { prisma, service } = setup();
    await service.updateItem('user-1', 'meal-1', 'item-1', { grams: 200, kcal: 253 });
    expect(prisma.mealItem.update).toHaveBeenCalledWith({
      where: { id: 'item-1' },
      data: { grams: 200, kcal: 253, estimated: false },
    });

    await service.updateItem('user-1', 'meal-1', 'item-1', { fat: 1 });
    expect(prisma.mealItem.update.mock.calls[1][0].data).toEqual({ fat: 1, estimated: false });
  });

  it('trocar só o nome mantém a estimativa', async () => {
    const { prisma, service } = setup();
    await service.updateItem('user-1', 'meal-1', 'item-1', { name: 'Arroz integral' });
    expect(prisma.mealItem.update.mock.calls[0][0].data).toEqual({ name: 'Arroz integral' });
  });
});

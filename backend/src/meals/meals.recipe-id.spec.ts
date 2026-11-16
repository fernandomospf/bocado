import { MealsService } from './meals.service';

const MINE = '11111111-1111-4111-8111-111111111111';
const OTHERS = '22222222-2222-4222-8222-222222222222';

function setup() {
  const prisma = {
    meal: {
      create: jest.fn().mockImplementation(({ data }) => ({
        id: 'meal-1',
        date: new Date('2026-11-15T00:00:00Z'),
        type: data.type,
        source: data.source,
        note: null,
        createdAt: new Date(),
        items: data.items.create.map((i: object, n: number) => ({ id: `i${n}`, mealId: 'meal-1', ...i })),
      })),
    },
    recipe: { findMany: jest.fn().mockResolvedValue([{ id: MINE }]) },
  };
  return { prisma, service: new MealsService(prisma as never, {} as never) };
}

const item = (extra: object = {}) => ({ name: 'Feijão', grams: 150, kcal: 190, protein: 4, carbs: 42, fat: 0.3, ...extra });

describe('MealItem.recipeId', () => {
  it('mantém o recipeId de receita visível e descarta o de receita alheia', async () => {
    const { prisma, service } = setup();
    await service.create('user-1', {
      date: '2026-11-15',
      type: 'LUNCH',
      items: [item({ recipeId: MINE }), item({ recipeId: OTHERS })],
    });
    const created = prisma.meal.create.mock.calls[0][0].data.items.create;
    expect(created[0].recipeId).toBe(MINE);
    expect(created[1].recipeId).toBeUndefined();
    expect(prisma.recipe.findMany.mock.calls[0][0].where.ownerId).toBe('user-1');
  });

  it('sem recipeId nos itens, nem consulta receitas', async () => {
    const { prisma, service } = setup();
    await service.create('user-1', { date: '2026-11-15', type: 'LUNCH', items: [item()] });
    expect(prisma.recipe.findMany).not.toHaveBeenCalled();
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { latestAllowedDay, MealsService } from './meals.service';
import { groupRecentMeals } from './recent';

const item = (name: string, grams: number, kcal = 100) => ({ name, grams, kcal, protein: 5, carbs: 10, fat: 2, estimated: false });
let n = 0;
const meal = (type: 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK', items: ReturnType<typeof item>[], daysAgo: number) => ({
  id: `meal-${++n}`,
  type,
  date: new Date(Date.UTC(2026, 10, 15 - daysAgo)),
  createdAt: new Date(Date.UTC(2026, 10, 15 - daysAgo, 12)),
  items,
});

describe('groupRecentMeals', () => {
  it('mesmo conjunto de (nome normalizado, gramas arredondadas) vira um grupo, com a frequência', () => {
    const out = groupRecentMeals(
      [
        meal('LUNCH', [item('Arroz branco', 151), item('Feijão', 100)], 1), // mais recente
        meal('LUNCH', [item('feijao', 104), item('ARROZ  BRANCO', 149)], 2), // mesmo conjunto (acento, caixa, ordem, gramas ~)
        meal('LUNCH', [item('Arroz branco', 200), item('Feijão', 100)], 3), // gramas diferentes: outro grupo
      ],
      undefined,
      8,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ times: 2, mealId: 'meal-' + (n - 2) });
    expect(out[1].times).toBe(1);
  });

  it('devolve a mais recente do grupo, com totais e itens', () => {
    const [g] = groupRecentMeals([meal('DINNER', [item('Ovo', 100, 150), item('Pão', 50, 130)], 1)], undefined, 8);
    expect(g.totals.kcal).toBe(280);
    expect(g.items).toHaveLength(2);
    expect(g.date).toBe('2026-11-14');
  });

  it('com type, prioriza esse tipo e completa com os demais; sem type, só frequência', () => {
    const rows = [
      meal('LUNCH', [item('Frango', 150)], 1),
      meal('LUNCH', [item('Frango', 150)], 2),
      meal('LUNCH', [item('Frango', 150)], 3),
      meal('BREAKFAST', [item('Pão', 50)], 4),
    ];
    expect(groupRecentMeals(rows, 'BREAKFAST', 8).map((g) => g.items[0].name)).toEqual(['Pão', 'Frango']);
    expect(groupRecentMeals(rows, undefined, 8).map((g) => g.items[0].name)).toEqual(['Frango', 'Pão']);
  });

  it('respeita o limite e ignora refeições sem itens', () => {
    const rows = [meal('LUNCH', [], 1), meal('LUNCH', [item('A', 10)], 2), meal('LUNCH', [item('B', 10)], 3)];
    expect(groupRecentMeals(rows, undefined, 1)).toHaveLength(1);
    expect(groupRecentMeals(rows, undefined, 8)).toHaveLength(2);
  });
});

describe('MealsService.repeat', () => {
  const source = {
    id: 'm1',
    userId: 'user-1',
    type: 'LUNCH',
    source: 'PHOTO',
    items: [
      { id: 'i1', mealId: 'm1', name: 'Arroz', grams: 150, kcal: 190, protein: 4, carbs: 40, fat: 1, estimated: true },
      { id: 'i2', mealId: 'm1', name: 'Frango', grams: 120, kcal: 200, protein: 30, carbs: 0, fat: 8, estimated: false },
    ],
  };

  function setup(owned = true) {
    const prisma = {
      meal: {
        findFirst: jest.fn().mockResolvedValue(owned ? source : null),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: 'novo',
          note: null,
          createdAt: new Date(),
          date: data.date,
          type: data.type,
          source: data.source,
          items: data.items.create.map((i: object, idx: number) => ({ id: `n${idx}`, mealId: 'novo', ...i })),
        })),
      },
    };
    return { prisma, service: new MealsService(prisma as never, {} as never) };
  }

  it('só busca a refeição do usuário da sessão (posse)', async () => {
    const { service, prisma } = setup(false);
    await expect(service.repeat('user-2', 'm1', { date: '2026-11-14' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'user-2' }, include: { items: true } });
    expect(prisma.meal.create).not.toHaveBeenCalled();
  });

  it('rejeita data futura', async () => {
    const { service, prisma } = setup();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    expect(future > latestAllowedDay()).toBe(true);
    await expect(service.repeat('user-1', 'm1', { date: future })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.meal.findFirst).not.toHaveBeenCalled();
  });

  it('duplica com itens novos (sem id), mantendo source e estimated; o tipo pode mudar', async () => {
    const { service, prisma } = setup();
    const out = await service.repeat('user-1', 'm1', { date: '2026-11-14', type: 'DINNER' as never });

    const data = prisma.meal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'user-1', type: 'DINNER', source: 'PHOTO' });
    expect(data.items.create).toEqual([
      { name: 'Arroz', grams: 150, kcal: 190, protein: 4, carbs: 40, fat: 1, estimated: true },
      { name: 'Frango', grams: 120, kcal: 200, protein: 30, carbs: 0, fat: 8, estimated: false },
    ]);
    expect(out.id).toBe('novo');
    expect(out.totals.kcal).toBe(390);
  });
});

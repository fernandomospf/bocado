import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FavoritesService, MAX_FAVORITES } from './favorites.service';

const mealRow = {
  id: 'm1',
  userId: 'user-1',
  type: 'LUNCH',
  items: [
    { id: 'i1', mealId: 'm1', name: 'Arroz branco', grams: 150, kcal: 190, protein: 4, carbs: 40, fat: 1, estimated: true },
    { id: 'i2', mealId: 'm1', name: 'Frango grelhado', grams: 120, kcal: 200, protein: 30, carbs: 0, fat: 8, estimated: false },
    { id: 'i3', mealId: 'm1', name: 'Salada', grams: 80, kcal: 20, protein: 1, carbs: 3, fat: 0, estimated: false },
  ],
};

function fav(over: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    userId: 'user-1',
    name: 'Meu almoço',
    type: 'LUNCH',
    items: [{ name: 'Arroz branco', grams: 150, kcal: 190, protein: 4, carbs: 40, fat: 1 }],
    createdAt: new Date(),
    lastUsedAt: null,
    ...over,
  };
}

function setup({ ownedMeal = true, existing = [] as object[], ownedFav = true } = {}) {
  const prisma = {
    meal: { findFirst: jest.fn().mockResolvedValue(ownedMeal ? mealRow : null) },
    favoriteMeal: {
      findMany: jest.fn().mockResolvedValue(existing),
      findFirst: jest.fn().mockResolvedValue(ownedFav ? fav() : null),
      findUniqueOrThrow: jest.fn().mockResolvedValue(fav({ name: 'Novo nome' })),
      create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'novo', createdAt: new Date(), lastUsedAt: null, ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: ownedFav ? 1 : 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: ownedFav ? 1 : 0 }),
      update: jest.fn(),
    },
  };
  const meals = { create: jest.fn().mockResolvedValue({ id: 'refeicao-nova' }) };
  return { prisma, meals, service: new FavoritesService(prisma as never, meals as never) };
}

describe('FavoritesService.create', () => {
  it('cria a partir da refeição do usuário, com snapshot sem ids e nome padrão dos 2 primeiros itens', async () => {
    const { service, prisma } = setup();
    const out = await service.create('user-1', { fromMealId: 'm1' });

    expect(prisma.meal.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', userId: 'user-1' }, include: { items: true } });
    const data = prisma.favoriteMeal.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ userId: 'user-1', name: 'Arroz branco + Frango grelhado', type: 'LUNCH' });
    expect(data.items).toHaveLength(3);
    expect(Object.keys(data.items[0]).sort()).toEqual(['carbs', 'fat', 'grams', 'kcal', 'name', 'protein']);
    expect(out).toMatchObject({ alreadyExists: false, totals: { kcal: 410 } });
  });

  it('usa o nome informado', async () => {
    const { service, prisma } = setup();
    await service.create('user-1', { fromMealId: 'm1', name: 'Almoço de segunda' });
    expect(prisma.favoriteMeal.create.mock.calls[0][0].data.name).toBe('Almoço de segunda');
  });

  it('refeição de outro usuário: 404, sem criar', async () => {
    const { service, prisma } = setup({ ownedMeal: false });
    await expect(service.create('user-2', { fromMealId: 'm1' })).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.favoriteMeal.create).not.toHaveBeenCalled();
  });

  it('conjunto igual já favoritado: devolve a existente, sem duplicar', async () => {
    const same = fav({ id: 'ja', items: mealRow.items.map(({ name, grams, kcal, protein, carbs, fat }) => ({ name, grams, kcal, protein, carbs, fat })) });
    const { service, prisma } = setup({ existing: [same] });
    const out = await service.create('user-1', { fromMealId: 'm1' });
    expect(out).toMatchObject({ id: 'ja', alreadyExists: true });
    expect(prisma.favoriteMeal.create).not.toHaveBeenCalled();
  });

  it(`limite de ${MAX_FAVORITES} favoritos: 409`, async () => {
    const many = Array.from({ length: MAX_FAVORITES }, (_, i) => fav({ id: `f${i}`, items: [{ name: `Item ${i}`, grams: 10, kcal: 1, protein: 0, carbs: 0, fat: 0 }] }));
    const { service, prisma } = setup({ existing: many });
    await expect(service.create('user-1', { fromMealId: 'm1' })).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.favoriteMeal.create).not.toHaveBeenCalled();
  });
});

describe('FavoritesService rename, remove e posse', () => {
  it('renomear e excluir filtram pelo userId da sessão', async () => {
    const { service, prisma } = setup();
    await service.rename('user-1', 'f1', 'Novo nome');
    expect(prisma.favoriteMeal.updateMany).toHaveBeenCalledWith({ where: { id: 'f1', userId: 'user-1' }, data: { name: 'Novo nome' } });
    await service.remove('user-1', 'f1');
    expect(prisma.favoriteMeal.deleteMany).toHaveBeenCalledWith({ where: { id: 'f1', userId: 'user-1' } });
  });

  it('favorita de outro usuário: 404 em renomear, excluir e registrar', async () => {
    const { service, meals } = setup({ ownedFav: false });
    await expect(service.rename('user-2', 'f1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('user-2', 'f1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.log('user-2', 'f1', { date: '2026-11-14', type: 'LUNCH' as never })).rejects.toBeInstanceOf(NotFoundException);
    expect(meals.create).not.toHaveBeenCalled();
  });
});

describe('FavoritesService.log', () => {
  it('cria a refeição com os itens do snapshot e atualiza lastUsedAt', async () => {
    const { service, prisma, meals } = setup();
    const out = await service.log('user-1', 'f1', { date: '2026-11-14', type: 'DINNER' as never });
    expect(prisma.favoriteMeal.findFirst).toHaveBeenCalledWith({ where: { id: 'f1', userId: 'user-1' } });
    expect(meals.create).toHaveBeenCalledWith('user-1', {
      date: '2026-11-14',
      type: 'DINNER',
      source: 'MANUAL',
      items: [{ name: 'Arroz branco', grams: 150, kcal: 190, protein: 4, carbs: 40, fat: 1 }],
    });
    expect(prisma.favoriteMeal.update.mock.calls[0][0].data.lastUsedAt).toBeInstanceOf(Date);
    expect(out).toEqual({ id: 'refeicao-nova' });
  });

  it('rejeita data futura antes de qualquer consulta', async () => {
    const { service, prisma, meals } = setup();
    const future = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await expect(service.log('user-1', 'f1', { date: future, type: 'LUNCH' as never })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.favoriteMeal.findFirst).not.toHaveBeenCalled();
    expect(meals.create).not.toHaveBeenCalled();
  });
});

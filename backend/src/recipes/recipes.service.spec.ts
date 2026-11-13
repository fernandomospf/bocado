import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecipesService } from './recipes.service';

const OWNER = 'owner-1';
const STRANGER = 'stranger-1';

const dto = {
  name: 'Arroz da casa',
  totalCookedGrams: 1300,
  servings: 4,
  ingredients: [
    { name: 'Arroz cru', grams: 500, kcal: 1789, protein: 35.8, carbs: 393.8, fat: 1.7, foodId: 'food-taco' },
    { name: 'Óleo', grams: 20, kcal: 176.8, protein: 0, carbs: 0, fat: 20, foodId: 'food-de-outro' },
  ],
};

const stored = {
  id: 'recipe-1',
  ownerId: OWNER,
  householdId: null,
  name: 'Arroz da casa',
  notes: null,
  totalCookedGrams: 1300,
  servings: 4,
  kcal100: 151.2,
  protein100: 2.8,
  carbs100: 30.3,
  fat100: 1.7,
  createdAt: new Date(),
  updatedAt: new Date(),
  ingredients: [],
};

function setup() {
  const prisma = {
    recipe: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    recipeIngredient: { deleteMany: jest.fn() },
    food: { findMany: jest.fn().mockResolvedValue([{ id: 'food-taco' }]) },
    $transaction: jest.fn(),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma, service: new RecipesService(prisma as never) };
}

describe('RecipesService: cálculo gravado', () => {
  it('grava os valores por 100 g calculados e descarta alimento de origem inválido', async () => {
    const { prisma, service } = setup();
    prisma.recipe.create.mockResolvedValue(stored);

    await service.create(OWNER, dto);

    const data = prisma.recipe.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ ownerId: OWNER, kcal100: 151.2, protein100: 2.8, carbs100: 30.3, fat100: 1.7 });
    expect(data.ingredients.create.map((i: { foodId: string | null }) => i.foodId)).toEqual(['food-taco', null]);
    expect(data.ingredients.create.map((i: { position: number }) => i.position)).toEqual([0, 1]);
  });
});

describe('RecipesService: permissões', () => {
  it('o dono edita', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findFirst.mockResolvedValue({ ownerId: OWNER });
    prisma.recipe.update.mockResolvedValue(stored);

    await service.update(OWNER, 'recipe-1', dto);

    expect(prisma.recipeIngredient.deleteMany).toHaveBeenCalledWith({ where: { recipeId: 'recipe-1' } });
    expect(prisma.recipe.update).toHaveBeenCalled();
  });

  it('o dono exclui', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findFirst.mockResolvedValue({ ownerId: OWNER });
    await service.remove(OWNER, 'recipe-1');
    expect(prisma.recipe.delete).toHaveBeenCalledWith({ where: { id: 'recipe-1' } });
  });

  it('um estranho não vê, não edita e não exclui (404, sem revelar que existe)', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findFirst.mockResolvedValue(null); // a consulta já filtra pelo que ele pode ver

    await expect(service.get(STRANGER, 'recipe-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update(STRANGER, 'recipe-1', dto)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove(STRANGER, 'recipe-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.recipe.update).not.toHaveBeenCalled();
    expect(prisma.recipe.delete).not.toHaveBeenCalled();
  });

  it('quem vê mas não é dono recebe 403 ao editar ou excluir', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findFirst.mockResolvedValue({ ownerId: OWNER });

    await expect(service.update('member-1', 'recipe-1', dto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove('member-1', 'recipe-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('sem casa, só enxerga as próprias receitas', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findMany.mockResolvedValue([]);
    await service.list(STRANGER);
    expect(prisma.recipe.findMany.mock.calls[0][0].where).toEqual({ ownerId: STRANGER });
  });
});

describe('RecipesService.list (mais usadas primeiro)', () => {
  it('ordena por uso nas refeições do usuário e, no empate, pela edição mais recente', async () => {
    const { prisma, service } = setup();
    const at = (d: string) => new Date(`${d}T12:00:00Z`);
    prisma.recipe.findMany.mockResolvedValue([
      { ...stored, id: 'nova', name: 'Bolo de cenoura', updatedAt: at('2026-11-10'), ingredients: [{ grams: 500 }] },
      { ...stored, id: 'feijao', name: 'Feijão da Vó', updatedAt: at('2026-10-01'), ingredients: [{ grams: 900 }] },
      { ...stored, id: 'arroz', name: 'Arroz da casa', updatedAt: at('2026-09-01'), ingredients: [{ grams: 520 }] },
      { ...stored, id: 'velha', name: 'Sopa', updatedAt: at('2026-01-01'), ingredients: [{ grams: 800 }] },
    ]);
    // A contagem vem por nome normalizado (sem acento e minúsculo)
    prisma.$queryRaw.mockResolvedValue([
      { norm: 'feijao da vo', times: BigInt(7) },
      { norm: 'arroz da casa', times: BigInt(2) },
    ]);

    const out = await service.list(OWNER);

    expect(out.map((r) => [r.id, r.timesUsed])).toEqual([
      ['feijao', 7],
      ['arroz', 2],
      ['nova', 0],
      ['velha', 0],
    ]);
  });

  it('sem receitas, nem consulta o uso', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findMany.mockResolvedValue([]);
    await service.list(OWNER);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('RecipesService.searchAsFoods', () => {
  it('filtra pelo nome normalizado e devolve porção e receita inteira', async () => {
    const { prisma, service } = setup();
    prisma.recipe.findMany.mockResolvedValue([
      { ...stored, ingredients: [{ grams: 500 }, { grams: 20 }] },
      { ...stored, id: 'recipe-2', name: 'Feijão', servings: null, totalCookedGrams: null, ingredients: [{ grams: 300 }] },
    ]);

    const out = await service.searchAsFoods(OWNER, ['arroz'], 5);

    expect(out).toEqual([
      {
        id: 'recipe-1',
        name: 'Arroz da casa',
        origin: 'recipe',
        per100: { kcal: 151.2, protein: 2.8, carbs: 30.3, fat: 1.7 },
        portion: { grams: 325, label: '1 porção' },
        whole: { grams: 1300 },
      },
    ]);
  });
});

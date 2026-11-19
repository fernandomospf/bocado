import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { RecipesService } from './recipes.service';

/** Banco real: a lista só usa receitas visíveis à pessoa e agrupa pela categoria da TACO. */
describeDb('Lista de compras (banco real)', () => {
  let prisma: PrismaService;
  let recipes: RecipesService;
  beforeAll(() => {
    prisma = createTestPrisma();
    recipes = new RecipesService(prisma);
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

  const recipe = (ownerId: string, name: string, ingredients: { name: string; grams: number; foodId?: string }[]) =>
    prisma.recipe.create({
      data: {
        ownerId, name, kcal100: 100, protein100: 5, carbs100: 10, fat100: 3,
        ingredients: { create: ingredients.map((i, position) => ({ ...i, kcal: 1, protein: 1, carbs: 1, fat: 1, position })) },
      },
    });

  it('soma, arredonda, agrupa pela TACO e junta a mesma receita repetida', async () => {
    const u = await makeUser(prisma);
    const taco = await prisma.food.create({
      data: { source: 'TACO', name: 'TESTE Feijão', searchName: 'teste feijao', category: 'Leguminosas e derivados', kcal100: 76, protein100: 4.8, carbs100: 13.6, fat100: 0.5 },
    });
    const a = await recipe(u.id, 'Feijoada leve', [{ name: 'Feijão', grams: 204, foodId: taco.id }, { name: 'Louro', grams: 2 }]);
    const out = await recipes.shoppingList(u.id, [{ recipeId: a.id, times: 2 }, { recipeId: a.id, times: 1 }]);
    expect(out.recipes).toEqual([{ id: a.id, name: 'Feijoada leve', times: 3 }]);
    expect(out.groups[0]).toEqual({ category: 'Leguminosas e derivados', items: [{ name: 'Feijão', grams: 610 }] }); // 612 -> 610
    expect(out.groups.at(-1)).toEqual({ category: 'Outros', items: [{ name: 'Louro', grams: 10 }] });
    expect(out.itemCount).toBe(2);
  });

  it('receita de outra pessoa (fora da casa) é "não encontrada"', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    const r = await recipe(a.id, 'Privada', [{ name: 'Arroz', grams: 100 }]);
    await expect(recipes.shoppingList(b.id, [{ recipeId: r.id, times: 1 }])).rejects.toBeInstanceOf(NotFoundException);
    await expect(recipes.shoppingList(a.id, [{ recipeId: r.id, times: 1 }])).resolves.toBeDefined();
  });
});

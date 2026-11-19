import { NotFoundException } from '@nestjs/common';
import { AdminFoodsService } from '../admin/admin-foods.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RecipesService } from '../recipes/recipes.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { FoodsService } from './foods.service';
import type { OffClient } from './off.client';

/** Banco real (TEST_DATABASE_URL descartável): confirmação única, criador, selo, denúncia, união e busca. */
describeDb('Acervo verificado e duplicados (banco real)', () => {
  let prisma: PrismaService;
  let foods: FoodsService;
  let admin: AdminFoodsService;

  beforeAll(() => {
    prisma = createTestPrisma();
    foods = new FoodsService(prisma, { searchAsFoods: async () => [] } as unknown as RecipesService, {} as OffClient);
    admin = new AdminFoodsService(prisma);
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

  let seq = 0;
  const product = (over: Record<string, unknown> = {}) => {
    seq += 1;
    return prisma.food.create({
      data: {
        source: 'LABEL', name: `TESTE Achocolatado ${seq}`, searchName: `teste achocolatado ${seq}`, brand: 'Marca',
        kcal100: 380, protein100: 4, carbs100: 88, fat100: 2, ...over,
      },
    });
  };

  it('uma confirmação por pessoa; repetir não conta de novo', async () => {
    const p = await product();
    const a = await makeUser(prisma);
    expect(await foods.confirm(a.id, p.id)).toMatchObject({ verifyCount: 1, verified: false, counted: true });
    expect(await foods.confirm(a.id, p.id)).toMatchObject({ verifyCount: 1, counted: false });
    expect(await prisma.foodConfirmation.count({ where: { foodId: p.id } })).toBe(1);
    expect(await foods.verification(a.id, p.id)).toMatchObject({ confirmedByMe: true, ownProduct: false });
  });

  it('o criador do produto não conta (nada é gravado)', async () => {
    const creator = await makeUser(prisma);
    const p = await product({ contributedById: creator.id });
    expect(await foods.confirm(creator.id, p.id)).toMatchObject({ verifyCount: 0, counted: false, ownProduct: true });
    expect(await prisma.foodConfirmation.count({ where: { foodId: p.id } })).toBe(0);
  });

  it('com 2 pessoas diferentes ganha o selo "Verificado" (na busca também)', async () => {
    const p = await product();
    const [a, b, viewer] = [await makeUser(prisma), await makeUser(prisma), await makeUser(prisma)];
    await foods.confirm(a.id, p.id);
    const r1 = await foods.search(viewer.id, p.name.toLowerCase());
    expect(r1.find((r) => r.id === p.id)).toMatchObject({ verified: false });
    expect(await foods.confirm(b.id, p.id)).toMatchObject({ verifyCount: 2, verified: true });
    const r2 = await foods.search(viewer.id, p.name.toLowerCase());
    expect(r2.find((r) => r.id === p.id)).toMatchObject({ verified: true });
  });

  it('uma denúncia aceita zera o selo (e as confirmações)', async () => {
    const p = await product();
    const [a, b, reporter] = [await makeUser(prisma), await makeUser(prisma), await makeUser(prisma)];
    await foods.confirm(a.id, p.id);
    await foods.confirm(b.id, p.id);
    expect((await foods.verification(a.id, p.id)).verified).toBe(true);
    await foods.report(reporter.id, p.id, 'kcal errada');
    expect(await foods.verification(a.id, p.id)).toMatchObject({ verifyCount: 0, verified: false, confirmedByMe: false });
    expect(await prisma.foodConfirmation.count({ where: { foodId: p.id } })).toBe(0);
  });

  it('TACO e produto inexistente não aceitam confirmação', async () => {
    const taco = await prisma.food.create({ data: { source: 'TACO', name: 'TESTE Arroz', searchName: 'teste arroz', kcal100: 128, protein100: 2.5, carbs100: 28, fat100: 0.2 } });
    const u = await makeUser(prisma);
    await expect(foods.confirm(u.id, taco.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(foods.confirm(u.id, '00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('detecta duplicados (nome + marca parecidos, valores até 5%) e ignora os de valores diferentes', async () => {
    const a = await product({ name: 'TESTE Leite em po', searchName: 'teste leite em po marca x' });
    const b = await product({ name: 'TESTE Leite em po', searchName: 'teste leite em po marca x', kcal100: 385 });
    await product({ name: 'TESTE Leite em po', searchName: 'teste leite em po marca x', kcal100: 520 }); // valores muito diferentes
    const { groups } = await admin.duplicates();
    const mine = groups.filter((g) => g.items.some((i) => [a.id, b.id].includes(i.id)));
    expect(mine).toHaveLength(1);
    expect(mine[0].items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    expect(mine[0].reasons).toContain('name');
  });

  it('"Unir": duplicados viram MERGED (nada é apagado), confirmações somadas, some da busca e o código redireciona', async () => {
    const canonical = await product({ barcode: '7891000100103', name: 'TESTE Canônico', searchName: 'teste canonico' });
    const dup = await product({ barcode: '4006381333931', name: 'TESTE Duplicado', searchName: 'teste duplicado' });
    const [u1, u2, u3] = [await makeUser(prisma), await makeUser(prisma), await makeUser(prisma)];
    await foods.confirm(u1.id, canonical.id);
    await foods.confirm(u1.id, dup.id); // mesma pessoa nos dois: conta uma vez
    await foods.confirm(u2.id, dup.id);

    const res = await admin.merge(canonical.id, [dup.id]);
    expect(res).toMatchObject({ verifyCount: 2, verified: true }); // u1 + u2
    expect(await prisma.food.findUniqueOrThrow({ where: { id: dup.id } })).toMatchObject({ status: 'MERGED', mergedIntoId: canonical.id });
    expect(await prisma.food.count({ where: { id: { in: [canonical.id, dup.id] } } })).toBe(2); // sem apagar

    // Some da busca
    const found = await foods.search(u3.id, 'teste duplicado');
    expect(found.some((r) => r.id === dup.id)).toBe(false);
    // O código do duplicado leva ao canônico
    const lookup = await foods.lookupBarcode('4006381333931');
    expect(lookup).toMatchObject({ found: true, food: { id: canonical.id, verified: true } });
    // Confirmar/denunciar o duplicado vale para o canônico
    expect(await foods.confirm(u3.id, dup.id)).toMatchObject({ id: canonical.id, verifyCount: 3 });
    // Itens já registrados guardam o snapshot: nada muda neles (não há foodId no MealItem)
  });

  it('"Unir" recusa canônico já unido, TACO e a mistura inválida', async () => {
    const a = await product();
    const b = await product();
    await admin.merge(a.id, [b.id]);
    await expect(admin.merge(b.id, [a.id])).rejects.toThrow(); // b já foi unido
    const taco = await prisma.food.create({ data: { source: 'TACO', name: 'TESTE TACO', searchName: 'teste taco', kcal100: 1, protein100: 1, carbs100: 1, fat100: 1 } });
    const c = await product();
    await expect(admin.merge(c.id, [taco.id])).rejects.toThrow();
    await expect(admin.merge(c.id, [c.id])).rejects.toThrow(); // nada a unir
  });
});

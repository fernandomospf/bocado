/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { HouseholdService } from '../household/household.service';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { MealsService } from './meals.service';
import { SharedMealsService } from './shared-meals.service';

describeDb('Refeição compartilhada (banco real)', () => {
  let prisma: PrismaService;
  let house: HouseholdService;
  let meals: MealsService;
  let shared: SharedMealsService;

  beforeAll(() => {
    prisma = createTestPrisma();
    house = new HouseholdService(prisma, { getOrThrow: () => 'https://bocado.test' } as unknown as ConfigService);
    meals = new MealsService(prisma, { targetsFor: async () => null } as never);
    shared = new SharedMealsService(prisma, meals);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  const items = [
    { name: 'Arroz', grams: 333.3, kcal: 427.1, protein: 8.3, carbs: 93.7, fat: 0.7 },
    { name: 'Frango', grams: 211.7, kcal: 348.9, protein: 65.1, carbs: 0, fat: 7.9 },
  ];
  const base = { date: '2026-11-10', type: 'DINNER' as const, items };

  /** Ana (dona), Bia e Caio na mesma casa; Duda em outra. */
  async function setup() {
    const [a, b, c, d] = [await makeUser(prisma, 'Ana'), await makeUser(prisma, 'Bia'), await makeUser(prisma, 'Caio'), await makeUser(prisma, 'Duda')];
    await house.create(a.id, 'Casa');
    for (const u of [b, c]) await house.join(u.id, (await house.createInvite(a.id)).code);
    await house.create(d.id, 'Outra casa');
    return { a, b, c, d };
  }
  const sumKcal = async (userId: string) =>
    (await prisma.mealItem.aggregate({ _sum: { kcal: true, grams: true }, where: { meal: { userId } } }))._sum;

  it('oferta: o remetente grava a própria parte; o outro recebe uma oferta e nada no diário', async () => {
    const { a, b } = await setup();
    const res = await shared.create(a.id, {
      ...base,
      participants: [{ userId: a.id, share: 0.6 }, { userId: b.id, share: 0.4 }],
    });
    expect(res.delivered).toEqual([{ userId: b.id, name: b.name, status: 'offered' }]);
    expect(res.meal.totals.kcal).toBe(Math.round(776 * 0.6));
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(0);

    const offers = await shared.listOffers(b.id);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ type: 'DINNER', share: 0.4, from: { id: a.id, name: a.name } });
    expect(JSON.stringify(offers)).not.toContain('@teste.local');
    expect(await shared.listOffers(a.id)).toEqual([]);
  });

  it('aceitar: cria a refeição com o mesmo grupo e sharedById; soma EXATA com a do remetente', async () => {
    const { a, b, c } = await setup();
    const res = await shared.create(a.id, {
      ...base,
      participants: [{ userId: a.id, share: 1 / 3 }, { userId: b.id, share: 1 / 3 }, { userId: c.id, share: 1 / 3 }],
    });
    const [ob] = await shared.listOffers(b.id);
    const [oc] = await shared.listOffers(c.id);
    const mb = await shared.accept(b.id, ob.id, {});
    await shared.accept(c.id, oc.id, {});

    const rows = await prisma.meal.findMany({ where: { sharedGroupId: { not: null } } });
    expect(new Set(rows.map((r) => r.sharedGroupId)).size).toBe(1);
    expect(rows.every((r) => r.sharedById === a.id)).toBe(true);
    expect(mb.date).toBe('2026-11-10');
    expect(res.meal.id).toBeTruthy();

    const total = { kcal: 0, grams: 0 };
    for (const u of [a, b, c]) {
      const s = await sumKcal(u.id);
      total.kcal += Math.round((s.kcal ?? 0) * 10);
      total.grams += Math.round((s.grams ?? 0) * 10);
    }
    expect(total.kcal).toBe(Math.round((427.1 + 348.9) * 10));
    expect(total.grams).toBe(Math.round((333.3 + 211.7) * 10));
    expect(await shared.listOffers(b.id)).toEqual([]);
  });

  it('aceitar com outro tipo move a refeição; aceitar duas vezes dá 404', async () => {
    const { a, b } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const [o] = await shared.listOffers(b.id);
    expect((await shared.accept(b.id, o.id, { type: 'SNACK' })).type).toBe('SNACK');
    await expect(shared.accept(b.id, o.id, {})).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(1);
  });

  it('só o destinatário aceita ou ignora (posse)', async () => {
    const { a, b, c } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const [o] = await shared.listOffers(b.id);
    await expect(shared.accept(c.id, o.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(shared.accept(a.id, o.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(shared.dismiss(c.id, o.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.sharedMealOffer.count()).toBe(1);
    await shared.dismiss(b.id, o.id);
    expect(await prisma.sharedMealOffer.count()).toBe(0);
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(0);
  });

  it('"sempre aceitar" liga autoAcceptShared; a próxima divisão cai direto no diário', async () => {
    const { a, b } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const [o] = await shared.listOffers(b.id);
    await shared.accept(b.id, o.id, { always: true });
    expect((await prisma.householdMember.findUniqueOrThrow({ where: { userId: b.id } })).autoAcceptShared).toBe(true);

    const res = await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.7 }, { userId: b.id, share: 0.3 }] });
    expect(res.delivered[0].status).toBe('added');
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(2);
    expect(await shared.listOffers(b.id)).toEqual([]);
  });

  it('oferta expirada: não aparece, aceitar dá 410 e a limpeza a apaga', async () => {
    const { a, b } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const past = new Date(Date.now() - 1000);
    const [o] = await shared.listOffers(b.id);
    await prisma.sharedMealOffer.update({ where: { id: o.id }, data: { expiresAt: past } });
    expect(await shared.listOffers(b.id)).toEqual([]);
    await expect(shared.accept(b.id, o.id, {})).rejects.toBeInstanceOf(GoneException);
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(0);

    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    await prisma.sharedMealOffer.updateMany({ data: { expiresAt: past } });
    // a primeira (vencida e recusada com 410) continua lá até a limpeza
    expect(await shared.cleanupExpired()).toBe(2);
    expect(await prisma.sharedMealOffer.count()).toBe(0);
  });

  it('validações: fora da casa, sem você, soma ≠ 1, repetido, data futura, mais de 6 → nada é gravado', async () => {
    const { a, b, d } = await setup();
    const call = (participants: { userId: string; share: number }[], extra = {}) =>
      shared.create(a.id, { ...base, ...extra, participants });

    await expect(call([{ userId: a.id, share: 0.5 }, { userId: d.id, share: 0.5 }])).rejects.toBeInstanceOf(ForbiddenException);
    await expect(call([{ userId: b.id, share: 0.5 }, { userId: d.id, share: 0.5 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(call([{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.4 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(call([{ userId: a.id, share: 0.5 }, { userId: a.id, share: 0.5 }])).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      call([{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }], { date: '2099-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const seven = Array.from({ length: 7 }, () => ({ userId: b.id, share: 1 / 7 }));
    await expect(call(seven)).rejects.toBeInstanceOf(BadRequestException);
    // tolerância de 0,001
    await expect(call([{ userId: a.id, share: 0.5004 }, { userId: b.id, share: 0.5 }])).resolves.toBeDefined();

    expect(await prisma.meal.count()).toBe(1); // só a do último (válido)
  });

  it('sem casa não divide', async () => {
    const solo = await makeUser(prisma);
    const other = await makeUser(prisma);
    await expect(
      shared.create(solo.id, { ...base, participants: [{ userId: solo.id, share: 0.5 }, { userId: other.id, share: 0.5 }] }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('transação atômica: se uma das cópias falha, nada fica gravado', async () => {
    const { a, b, c } = await setup();
    // Falha na SEGUNDA oferta, dentro da transação (depois da refeição do remetente e da primeira oferta)
    const realTx = prisma.$transaction.bind(prisma) as (fn: (tx: any) => Promise<unknown>) => Promise<unknown>;
    jest.spyOn(prisma, '$transaction').mockImplementation(((fn: (tx: any) => Promise<unknown>) =>
      realTx((tx) => {
        const create = tx.sharedMealOffer.create.bind(tx.sharedMealOffer);
        let calls = 0;
        tx.sharedMealOffer.create = (args: unknown) => {
          calls += 1;
          if (calls === 2) throw new Error('falha simulada');
          return create(args);
        };
        return fn(tx);
      })) as never);
    await expect(
      shared.create(a.id, {
        ...base,
        participants: [{ userId: a.id, share: 0.4 }, { userId: b.id, share: 0.3 }, { userId: c.id, share: 0.3 }],
      }),
    ).rejects.toThrow('falha simulada');
    jest.restoreAllMocks();
    expect(await prisma.meal.count()).toBe(0);
    expect(await prisma.sharedMealOffer.count()).toBe(0);
  });

  it('cópias independentes: apagar a do remetente não afeta a de quem recebeu', async () => {
    const { a, b } = await setup();
    const res = await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const [o] = await shared.listOffers(b.id);
    await shared.accept(b.id, o.id, {});
    await meals.remove(a.id, res.meal.id);
    expect(await prisma.meal.count({ where: { userId: b.id } })).toBe(1);
  });

  it('day: quem recebeu vê sharedBy; quem enviou vê splitWith; quem saiu da casa vira só "shared"', async () => {
    const { a, b } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const sent = (await meals.day(a.id, '2026-11-10')).meals[0] as unknown as Record<string, unknown>;
    expect(sent).toMatchObject({ shared: true, splitWith: [{ id: b.id, name: b.name }] });
    expect(sent.sharedBy).toBeUndefined();

    const [o] = await shared.listOffers(b.id);
    await shared.accept(b.id, o.id, {});
    const got = (await meals.day(b.id, '2026-11-10')).meals[0] as unknown as Record<string, unknown>;
    expect(got).toMatchObject({ shared: true, sharedBy: { id: a.id, name: a.name } });

    await house.leave(a.id);
    const after = (await meals.day(b.id, '2026-11-10')).meals[0] as unknown as Record<string, unknown>;
    expect(after.shared).toBe(true);
    expect(after.sharedBy).toBeUndefined();
  });

  it('sair da casa apaga as ofertas pendentes enviadas e recebidas', async () => {
    const { a, b, c } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    await shared.create(c.id, { ...base, participants: [{ userId: c.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    expect(await prisma.sharedMealOffer.count()).toBe(2);
    await house.leave(b.id);
    expect(await prisma.sharedMealOffer.count()).toBe(0);
  });

  it('excluir a conta de quem enviou: a cópia no diário de outro fica, com sharedById nulo; ofertas somem', async () => {
    const { a, b, c } = await setup();
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }] });
    const [o] = await shared.listOffers(b.id);
    await shared.accept(b.id, o.id, {});
    await shared.create(a.id, { ...base, participants: [{ userId: a.id, share: 0.5 }, { userId: c.id, share: 0.5 }] });

    await prisma.user.delete({ where: { id: a.id } });

    const copy = await prisma.meal.findFirstOrThrow({ where: { userId: b.id } });
    expect(copy.sharedById).toBeNull();
    expect(copy.sharedGroupId).not.toBeNull();
    expect(await prisma.sharedMealOffer.count()).toBe(0);
    const day = (await meals.day(b.id, '2026-11-10')).meals[0] as unknown as Record<string, unknown>;
    expect(day.shared).toBe(true);
    expect(day.sharedBy).toBeUndefined();
  });
});

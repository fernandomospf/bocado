import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { RecipesService } from '../recipes/recipes.service';
import { HouseholdService } from './household.service';
import { INVITE_CODE_RE, MAX_ACTIVE_INVITES, MAX_MEMBERS, removeFromHousehold } from './household.logic';

describeDb('Casa e convites (banco real)', () => {
  let prisma: PrismaService;
  let house: HouseholdService;
  let recipes: RecipesService;

  beforeAll(() => {
    prisma = createTestPrisma();
    const config = { getOrThrow: () => 'https://bocado.test' } as unknown as ConfigService;
    house = new HouseholdService(prisma, config);
    recipes = new RecipesService(prisma);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  const recipeDto = {
    name: 'Feijão',
    ingredients: [{ name: 'Feijão cru', grams: 200, kcal: 700, protein: 40, carbs: 120, fat: 2 }],
  };

  async function setup() {
    const a = await makeUser(prisma, 'Ana');
    const b = await makeUser(prisma, 'Bia');
    await house.create(a.id, 'Casa da Ana');
    const invite = await house.createInvite(a.id);
    return { a, b, invite };
  }

  it('código com 8 caracteres do alfabeto sem ambíguos e link com APP_URL', async () => {
    const { invite } = await setup();
    expect(invite.code).toMatch(INVITE_CODE_RE);
    expect(invite.code).not.toMatch(/[01OIL]/);
    expect(invite.link).toBe(`https://bocado.test/convite/${invite.code}`);
  });

  it('entrar: vira MEMBER, consome o convite e o preview deixa de funcionar', async () => {
    const { a, b, invite } = await setup();
    expect(await house.preview(invite.code)).toEqual({ householdName: 'Casa da Ana', inviterFirstName: a.name.split(' ')[0] });
    const joined = await house.join(b.id, invite.code);
    expect(joined?.members.map((m) => m.role)).toEqual(['OWNER', 'MEMBER']);
    await expect(house.preview(invite.code)).rejects.toBeInstanceOf(NotFoundException);
    const c = await makeUser(prisma);
    await expect(house.join(c.id, invite.code)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('código inválido, expirado e revogado dão o mesmo 404 genérico', async () => {
    const { a, b, invite } = await setup();
    const messages = new Set<string>();
    const grab = async (p: Promise<unknown>) => {
      try {
        await p;
      } catch (e) {
        expect(e).toBeInstanceOf(NotFoundException);
        messages.add((e as Error).message);
      }
    };
    await grab(house.preview('ZZZZZZZZ'));
    await prisma.householdInvite.update({ where: { code: invite.code }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await grab(house.preview(invite.code));
    await grab(house.join(b.id, invite.code));
    const fresh = await house.createInvite(a.id);
    await house.revokeInvite(a.id, fresh.id);
    await grab(house.join(b.id, fresh.code));
    expect(messages.size).toBe(1);
  });

  it('já em uma casa: 409, e o convite não é consumido', async () => {
    const { a, invite } = await setup();
    const c = await makeUser(prisma);
    await house.create(c.id, 'Outra casa');
    await expect(house.join(c.id, invite.code)).rejects.toBeInstanceOf(ConflictException);
    await expect(house.create(c.id, 'De novo')).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.householdInvite.findUnique({ where: { code: invite.code } }))?.usedAt).toBeNull();
    expect(await house.get(a.id)).not.toBeNull();
  });

  it('casa cheia (6 membros): 409', async () => {
    const { a } = await setup();
    for (let i = 1; i < MAX_MEMBERS; i++) {
      const u = await makeUser(prisma);
      await house.join(u.id, (await house.createInvite(a.id)).code);
      await prisma.householdInvite.deleteMany({ where: { usedAt: { not: null } } });
    }
    const extra = await makeUser(prisma);
    const code = (await house.createInvite(a.id)).code;
    await expect(house.join(extra.id, code)).rejects.toBeInstanceOf(ConflictException);
  });

  it('só OWNER convida, lista, revoga e remove; limite de 5 convites ativos', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    await expect(house.createInvite(b.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(house.listInvites(b.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(house.removeMember(b.id, a.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(house.rename(b.id, 'Minha')).rejects.toBeInstanceOf(ForbiddenException);
    for (let i = 0; i < MAX_ACTIVE_INVITES; i++) await house.createInvite(a.id);
    await expect(house.createInvite(a.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('get nunca devolve e-mail dos membros', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    const json = JSON.stringify(await house.get(b.id));
    expect(json).not.toContain('@teste.local');
    expect(json).not.toContain('email');
    expect(a.email).toBeTruthy();
  });

  it('OWNER sai: o membro mais antigo assume; receitas compartilhadas voltam a privadas; convites dele caem', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    const r = await recipes.create(a.id, recipeDto);
    await recipes.setShared(a.id, r.id, true);
    await house.createInvite(a.id);

    await house.leave(a.id);

    expect((await house.get(b.id))?.me.role).toBe('OWNER');
    expect((await prisma.recipe.findUniqueOrThrow({ where: { id: r.id } })).householdId).toBeNull();
    expect(await prisma.householdInvite.count()).toBe(0);
    expect(await house.get(a.id)).toBeNull();
  });

  it('último a sair apaga a casa', async () => {
    const { a } = await setup();
    await house.leave(a.id);
    expect(await prisma.household.count()).toBe(0);
    await expect(house.leave(a.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('OWNER remove membro; não remove de outra casa nem a si mesmo', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    const r = await recipes.create(b.id, recipeDto);
    await recipes.setShared(b.id, r.id, true);
    const other = await makeUser(prisma);
    await house.create(other.id, 'Vizinhos');

    await expect(house.removeMember(a.id, other.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(house.removeMember(a.id, a.id)).rejects.toThrow();
    await house.removeMember(a.id, b.id);

    expect(await house.get(b.id)).toBeNull();
    expect((await prisma.recipe.findUniqueOrThrow({ where: { id: r.id } })).householdId).toBeNull();
    expect((await house.get(a.id))?.members).toHaveLength(1);
  });

  it('receitas: dono, membro e estranho', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    const stranger = await makeUser(prisma);
    const priv = await recipes.create(a.id, recipeDto);
    const shared = await recipes.create(a.id, { ...recipeDto, name: 'Compartilhada' });
    await recipes.setShared(a.id, shared.id, true);

    // leitura
    expect((await recipes.list(b.id)).map((r) => r.name)).toEqual(['Compartilhada']);
    expect((await recipes.list(b.id))[0]).toMatchObject({ isOwner: false, shared: true, ownerName: a.name });
    expect(await recipes.list(stranger.id)).toEqual([]);
    await expect(recipes.get(b.id, priv.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(recipes.get(stranger.id, shared.id)).rejects.toBeInstanceOf(NotFoundException);
    // edição e exclusão
    await expect(recipes.update(b.id, shared.id, recipeDto)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(recipes.remove(b.id, shared.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(recipes.update(stranger.id, shared.id, recipeDto)).rejects.toBeInstanceOf(NotFoundException);
    await expect(recipes.setShared(b.id, shared.id, false)).rejects.toBeInstanceOf(ForbiddenException);
    // duplicar: cópia privada de B
    const copy = await recipes.duplicate(b.id, shared.id);
    expect(copy).toMatchObject({ isOwner: true, shared: false });
    expect((await recipes.list(a.id)).map((r) => r.name).sort()).toEqual(['Compartilhada', 'Feijão']);
    await expect(recipes.duplicate(stranger.id, shared.id)).rejects.toBeInstanceOf(NotFoundException);
    // quem não tem casa não compartilha
    await expect(recipes.setShared(stranger.id, (await recipes.create(stranger.id, recipeDto)).id, true)).rejects.toThrow();
  });

  it('exclusão de conta pela mesma regra: OWNER excluído passa a casa adiante', async () => {
    const { a, b, invite } = await setup();
    await house.join(b.id, invite.code);
    await prisma.$transaction(async (tx) => {
      await removeFromHousehold(tx, a.id);
      await tx.user.delete({ where: { id: a.id } });
    });
    expect((await house.get(b.id))?.me.role).toBe('OWNER');
  });
});

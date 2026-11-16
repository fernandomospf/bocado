/* eslint-disable @typescript-eslint/no-explicit-any */
import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { NestFactory } from '@nestjs/core';
import { PrismaService as Prisma } from '../prisma/prisma.service';
import cookieParser from 'cookie-parser';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, dbTestsEnabled, describeDb, makeUser } from '../testing/db';

/**
 * App Nest completo (guards, validação e rate limit reais) sobre o banco descartável, chamado por HTTP.
 * O DATABASE_URL do processo é trocado pelo do banco de teste ANTES de subir o app.
 */
describeDb('HTTP: privacidade entre membros da casa e rate limits', () => {
  let app: INestApplication;
  let base: string;
  let prisma: PrismaService;
  let jwt: JwtService;

  beforeAll(async () => {
    if (!dbTestsEnabled) return;
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'x'.repeat(40);
    process.env.APP_URL = 'https://bocado.test';
    process.env.ADMIN_EMAILS = 'admin-http@teste.local';
    const { AppModule } = await import('../app.module');
    app = await NestFactory.create(AppModule, { logger: false });
    (app as any).set('trust proxy', true); // cada teste de rate limit usa o seu próprio IP via X-Forwarded-For
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0);
    base = `${await app.getUrl()}/api`.replace('[::1]', 'localhost');
    prisma = app.get(Prisma);
    jwt = app.get(JwtService, { strict: false });
  });
  afterAll(async () => {
    if (!app) return;
    await cleanDb(prisma);
    await app.close();
  });
  beforeEach(() => cleanDb(prisma));

  const tokenOf = (u: { id: string; email: string }) => jwt.sign({ sub: u.id, email: u.email });
  async function call(token: string | null, method: string, path: string, body?: unknown, ip?: string) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(ip ? { 'X-Forwarded-For': ip } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, text };
  }

  /** Ana (A) e Bia (B) na mesma casa; A tem dados de todos os tipos, todos marcados com SEGREDO-A. */
  async function scenario() {
    const a = await makeUser(prisma, 'Ana');
    const b = await makeUser(prisma, 'Bia');
    const ta = tokenOf(a);
    const tb = tokenOf(b);
    expect((await call(ta, 'POST', '/household', { name: 'Casa' })).status).toBe(201);
    const invite = JSON.parse((await call(ta, 'POST', '/household/invites')).text);
    expect((await call(tb, 'POST', '/household/join', { code: invite.code })).status).toBe(200);

    const day = new Date('2026-11-10T00:00:00Z');
    await prisma.profile.create({
      data: {
        userId: a.id, sex: 'FEMALE', birthDate: new Date('1990-01-01'), heightCm: 171, weightKg: 87.3,
        activityLevel: 'MODERATE', goal: 'LOSE', kcalTarget: 1777, proteinTarget: 133, carbsTarget: 188, fatTarget: 55,
      },
    });
    await prisma.profile.create({
      data: {
        userId: b.id, sex: 'MALE', birthDate: new Date('1985-05-05'), heightCm: 180, weightKg: 70.1,
        activityLevel: 'LIGHT', goal: 'MAINTAIN', kcalTarget: 2200, proteinTarget: 120, carbsTarget: 250, fatTarget: 70,
      },
    });
    const meal = await prisma.meal.create({
      data: { userId: a.id, date: day, type: 'LUNCH', note: 'SEGREDO-A-NOTA', items: { create: [{ name: 'SEGREDO-A-REFEICAO', grams: 123, kcal: 1234, protein: 1, carbs: 2, fat: 3 }] } },
      include: { items: true },
    });
    await prisma.weightEntry.create({ data: { userId: a.id, date: day, weightKg: 87.3, note: 'SEGREDO-A-PESO' } });
    const workout = await prisma.workout.create({ data: { userId: a.id, date: day, type: 'RUN', durationMin: 47, intensity: 'MODERATE', note: 'SEGREDO-A-TREINO' } });
    const fav = await prisma.favoriteMeal.create({ data: { userId: a.id, name: 'SEGREDO-A-FAVORITA', items: [{ name: 'SEGREDO-A-FAVORITA', grams: 1, kcal: 1, protein: 0, carbs: 0, fat: 0 }] } });
    await prisma.adaptiveAdjustment.create({
      data: { userId: a.id, action: 'APPLIED', windowStart: day, windowEnd: day, avgIntake: 1999, weightStartKg: 88.8, weightEndKg: 87.3, estimatedTdee: 2468, confidence: 'HIGH', previousKcal: 1777, newKcal: 1666 },
    });
    const secretRecipe = await prisma.recipe.create({
      data: { ownerId: a.id, name: 'SEGREDO-A-RECEITA', kcal100: 1, protein100: 1, carbs100: 1, fat100: 1, ingredients: { create: [{ name: 'x', grams: 1, kcal: 1, protein: 1, carbs: 1, fat: 1, position: 0 }] } },
    });
    const sharedRecipe = await prisma.recipe.create({
      data: { ownerId: a.id, name: 'Receita da casa', householdId: (await prisma.householdMember.findUniqueOrThrow({ where: { userId: a.id } })).householdId, kcal100: 1, protein100: 1, carbs100: 1, fat100: 1, ingredients: { create: [{ name: 'x', grams: 1, kcal: 1, protein: 1, carbs: 1, fat: 1, position: 0 }] } },
    });
    return { a, b, ta, tb, meal, workout, fav, secretRecipe, sharedRecipe };
  }

  const SECRETS = ['SEGREDO-A', '87.3', '1234', '1777', '1666', '2468'];

  it('B não lê meals, days, profile, peso, treinos, relatórios, favoritas, meta adaptativa nem exportação de A', async () => {
    const { a, tb } = await scenario();
    const q = 'from=2026-11-01&to=2026-11-30';
    const gets = [
      '/auth/me', '/profile', '/days/2026-11-10', `/days?${q}`, '/meals/recent', `/weight?${q}`, '/weight/summary',
      `/workouts?${q}`, '/workouts/last', '/favorites', '/reports/weekly?week=2026-11-09', '/reports/weekly/list',
      '/reports/weekly/pending?today=2026-11-16&hour=12', '/adaptive/status?today=2026-11-16', '/adaptive/history',
      '/export/summary?period=365d&to=2026-11-16', '/export/meals.csv?period=365d&to=2026-11-16',
      '/export/weight.csv?period=365d&to=2026-11-16', '/export/workouts.csv?period=365d&to=2026-11-16',
      '/suggestions/close-day?date=2026-11-10', '/recipes', '/household', '/shared-meals/offers',
    ];
    let ok = 0;
    const statuses: string[] = [];
    for (const path of gets) {
      const res = await call(tb, 'GET', path);
      expect(res.status).toBeLessThan(500);
      for (const s of SECRETS) expect({ path, leaks: res.text.includes(s) ? s : null }).toEqual({ path, leaks: null });
      expect({ path, email: res.text.includes(a.email) }).toEqual({ path, email: false });
      if (res.status === 200) ok += 1;
      else statuses.push(`${res.status} ${path}`);
    }
    expect({ ok, naoOk: statuses }).toMatchObject({ ok: gets.length - statuses.length });
  });

  it('B não consegue alterar nem apagar registros de A pelo id (404)', async () => {
    const { tb, meal, workout, fav, secretRecipe } = await scenario();
    const item = meal.items[0].id;
    const checks: [string, string, unknown?][] = [
      ['DELETE', `/meals/${meal.id}`],
      ['PATCH', `/meals/${meal.id}/items/${item}`, { kcal: 1 }],
      ['DELETE', `/meals/${meal.id}/items/${item}`],
      ['POST', `/meals/${meal.id}/repeat`, { date: '2026-11-11' }],
      ['PATCH', `/workouts/${workout.id}`, { note: 'x' }],
      ['DELETE', `/workouts/${workout.id}`],
      ['PATCH', `/favorites/${fav.id}`, { name: 'x' }],
      ['DELETE', `/favorites/${fav.id}`],
      ['POST', `/favorites/${fav.id}/log`, { date: '2026-11-11', type: 'LUNCH' }],
      ['GET', `/recipes/${secretRecipe.id}`],
      ['PUT', `/recipes/${secretRecipe.id}`, { name: 'novo nome', ingredients: [{ name: 'a', grams: 1, kcal: 1, protein: 0, carbs: 0, fat: 0 }] }],
      ['DELETE', `/recipes/${secretRecipe.id}`],
      ['POST', `/recipes/${secretRecipe.id}/duplicate`],
      ['PATCH', `/recipes/${secretRecipe.id}/share`, { shared: true }],
    ];
    for (const [method, path, body] of checks) {
      const res = await call(tb, method, path, body);
      expect({ method, path, status: res.status }).toEqual({ method, path, status: 404 });
    }
    expect(await prisma.meal.count()).toBe(1);
    expect(await prisma.workout.count()).toBe(1);
    expect(await prisma.favoriteMeal.count()).toBe(1);
    expect(await prisma.recipe.count()).toBe(2);
  });

  it('o que B enxerga de A: nome, foto e receitas compartilhadas, nunca e-mail; só o dono edita a da casa', async () => {
    const { a, b, tb, ta, sharedRecipe } = await scenario();
    const house = JSON.parse((await call(tb, 'GET', '/household')).text);
    expect(house.members.map((m: any) => Object.keys(m).sort())).toEqual([['avatarUrl', 'id', 'name', 'role'], ['avatarUrl', 'id', 'name', 'role']]);
    expect(JSON.stringify(house)).not.toContain(a.email);
    expect(JSON.stringify(house)).not.toContain(b.email);

    const recipes = JSON.parse((await call(tb, 'GET', '/recipes')).text);
    expect(recipes.map((r: any) => r.name)).toEqual(['Receita da casa']);
    expect(recipes[0]).toMatchObject({ isOwner: false, shared: true, ownerName: a.name });
    expect((await call(tb, 'GET', `/recipes/${sharedRecipe.id}`)).status).toBe(200);
    expect((await call(tb, 'DELETE', `/recipes/${sharedRecipe.id}`)).status).toBe(403);
    expect((await call(tb, 'PATCH', `/recipes/${sharedRecipe.id}/share`, { shared: false })).status).toBe(403);
    expect((await call(ta, 'GET', '/household/invites')).status).toBe(200);
    expect((await call(tb, 'GET', '/household/invites')).status).toBe(403);
    expect((await call(tb, 'POST', '/household/invites')).status).toBe(403);
  });

  it('refeição dividida: B só recebe a oferta (nada do diário de A além da parte dele); posse na aceitação', async () => {
    const { a, b, ta, tb } = await scenario();
    const res = await call(ta, 'POST', '/meals/shared', {
      date: '2026-11-10', type: 'DINNER',
      items: [{ name: 'Sopa', grams: 400, kcal: 300, protein: 20, carbs: 30, fat: 8 }],
      participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }],
    });
    expect(res.status).toBe(201);
    const offers = JSON.parse((await call(tb, 'GET', '/shared-meals/offers')).text);
    expect(offers).toHaveLength(1);
    expect(offers[0].totals.kcal).toBe(150);
    expect(JSON.stringify(offers)).not.toContain('SEGREDO-A');
    expect(JSON.stringify(offers)).not.toContain(a.email);
    expect((await call(ta, 'POST', `/shared-meals/offers/${offers[0].id}/accept`, {})).status).toBe(404);
    expect((await call(ta, 'DELETE', `/shared-meals/offers/${offers[0].id}`)).status).toBe(404);
    expect((await call(tb, 'POST', `/shared-meals/offers/${offers[0].id}/accept`, { type: 'SNACK' })).status).toBe(200);
    // B vê o próprio dia (só a parte dele), nunca o almoço secreto de A
    const dayB = (await call(tb, 'GET', '/days/2026-11-10')).text;
    expect(dayB).not.toContain('SEGREDO-A');
    expect(JSON.parse(dayB).meals).toHaveLength(1);
  });

  it('exclusão de conta de A: casa, receitas compartilhadas, ofertas e sharedById ficam consistentes', async () => {
    const { a, b, ta, tb } = await scenario();
    await call(ta, 'POST', '/meals/shared', {
      date: '2026-11-10', type: 'DINNER',
      items: [{ name: 'Sopa', grams: 400, kcal: 300, protein: 20, carbs: 30, fat: 8 }],
      participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }],
    });
    const [offer] = JSON.parse((await call(tb, 'GET', '/shared-meals/offers')).text);
    await call(tb, 'POST', `/shared-meals/offers/${offer.id}/accept`, {});
    await call(ta, 'POST', '/meals/shared', {
      date: '2026-11-09', type: 'DINNER',
      items: [{ name: 'Sopa', grams: 400, kcal: 300, protein: 20, carbs: 30, fat: 8 }],
      participants: [{ userId: a.id, share: 0.5 }, { userId: b.id, share: 0.5 }],
    });

    // Conta sem senha (como Google): a exclusão dispensa a senha
    const res = await call(ta, 'DELETE', '/account', { confirmation: 'EXCLUIR' });
    expect([200, 204]).toContain(res.status);

    expect(await prisma.user.findUnique({ where: { id: a.id } })).toBeNull();
    expect(await prisma.recipe.count()).toBe(0);
    expect(await prisma.sharedMealOffer.count()).toBe(0);
    const house = JSON.parse((await call(tb, 'GET', '/household')).text);
    expect(house.me.role).toBe('OWNER');
    expect(house.members).toHaveLength(1);
    const copy = await prisma.meal.findFirstOrThrow({ where: { userId: b.id } });
    expect(copy.sharedById).toBeNull();
    const dayB = JSON.parse((await call(tb, 'GET', '/days/2026-11-10')).text);
    expect(dayB.meals[0].shared).toBe(true);
    expect(dayB.meals[0].sharedBy).toBeUndefined();
  });

  it('PATCH /profile/preferences com hideCalories: booleano válido, inválido rejeitado, só o próprio usuário', async () => {
    const { a, b, ta, tb } = await scenario();
    // inválido ou fora do contrato: 400, nada muda
    expect((await call(tb, 'PATCH', '/profile/preferences', { hideCalories: 'sim' })).status).toBe(400);
    expect((await call(tb, 'PATCH', '/profile/preferences', { hideCalories: 1 })).status).toBe(400);
    expect((await call(tb, 'PATCH', '/profile/preferences', { hideCalories: true, userId: a.id })).status).toBe(400);
    expect((await call(null, 'PATCH', '/profile/preferences', { hideCalories: true })).status).toBe(401);
    expect((await prisma.profile.findUniqueOrThrow({ where: { userId: b.id } })).hideCalories).toBe(false);

    // válido: liga e desliga, devolvido no GET /profile, e só o perfil de B muda
    const on = await call(tb, 'PATCH', '/profile/preferences', { hideCalories: true });
    expect(on.status).toBe(200);
    expect(JSON.parse(on.text).hideCalories).toBe(true);
    expect(JSON.parse((await call(tb, 'GET', '/profile')).text).hideCalories).toBe(true);
    expect(JSON.parse((await call(ta, 'GET', '/profile')).text).hideCalories).toBe(false);
    // outras preferências continuam independentes (peso e semana não são amarrados)
    expect(JSON.parse((await call(tb, 'PATCH', '/profile/preferences', { hideWeightInReports: true })).text)).toMatchObject({ hideCalories: true, hideWeightInReports: true });
    expect(JSON.parse((await call(tb, 'PATCH', '/profile/preferences', { hideCalories: false })).text)).toMatchObject({ hideCalories: false, hideWeightInReports: true });
  });

  it('com hideCalories: estimativa de treino desligada, meta adaptativa sem sugestão; os dados continuam guardados e a exportação traz kcal', async () => {
    const { b, tb } = await scenario();
    await prisma.workout.create({ data: { userId: b.id, date: new Date('2026-11-10T00:00:00Z'), type: 'RUN', durationMin: 40, intensity: 'MODERATE' } });
    await prisma.meal.create({ data: { userId: b.id, date: new Date('2026-11-10T00:00:00Z'), type: 'LUNCH', items: { create: [{ name: 'Arroz', grams: 100, kcal: 130, protein: 3, carbs: 28, fat: 0.3 }] } } });
    await call(tb, 'PATCH', '/profile/preferences', { workoutEstimateEnabled: true, workoutAddToGoal: true });

    const before = JSON.parse((await call(tb, 'GET', '/days/2026-11-10')).text);
    expect(before.workouts[0].estimateKcal).toBeGreaterThan(0);
    expect(before.goalBonusKcal).toBeGreaterThan(0);

    await call(tb, 'PATCH', '/profile/preferences', { hideCalories: true });
    const hidden = JSON.parse((await call(tb, 'GET', '/days/2026-11-10')).text);
    expect(hidden.workouts[0].estimateKcal).toBeUndefined();
    expect(hidden.goalBonusKcal).toBeUndefined();
    expect(hidden.totals.kcal).toBe(130); // o backend segue devolvendo as calorias
    expect(JSON.parse((await call(tb, 'GET', '/adaptive/status?today=2026-11-16')).text).state).toBe('disabled');
    const csv = await call(tb, 'GET', '/export/meals.csv?period=30d&to=2026-11-16');
    expect(csv.status).toBe(200);
    expect(csv.text.toLowerCase()).toContain('kcal');
    // as preferências de treino guardadas não foram mexidas
    const p = await prisma.profile.findUniqueOrThrow({ where: { userId: b.id } });
    expect([p.workoutEstimateEnabled, p.workoutAddToGoal]).toEqual([true, true]);

    // desligar o modo: tudo volta como estava
    await call(tb, 'PATCH', '/profile/preferences', { hideCalories: false });
    const back = JSON.parse((await call(tb, 'GET', '/days/2026-11-10')).text);
    expect(back.workouts[0].estimateKcal).toBeGreaterThan(0);
    expect(back.goalBonusKcal).toBeGreaterThan(0);
  });

  it('beta por HTTP: lista de espera pública (validação, rate limit por IP), sem listagem pública, e /admin só para admin', async () => {
    const admin = await prisma.user.create({ data: { email: 'admin-http@teste.local', name: 'Admin' } });
    const other = await makeUser(prisma, 'Comum');
    const ta = tokenOf(admin);
    const to = tokenOf(other);
    const ip = '10.8.8.8';
    const good = { email: 'Fila@Teste.Local ', name: 'Fila', consent: true };

    expect((await call(null, 'POST', '/waitlist', { ...good, consent: false }, ip)).status).toBe(400);
    expect((await call(null, 'POST', '/waitlist', { ...good, email: 'nao-e-email' }, ip)).status).toBe(400);
    expect((await call(null, 'POST', '/waitlist', { ...good, extra: 1 }, ip)).status).toBe(400);
    const ok = await call(null, 'POST', '/waitlist', good, ip);
    expect({ status: ok.status, body: JSON.parse(ok.text) }).toEqual({ status: 200, body: { ok: true } });
    expect(await prisma.waitlistEntry.count({ where: { email: 'fila@teste.local' } })).toBe(1);
    // nenhuma listagem pública
    expect((await call(null, 'GET', '/waitlist', undefined, ip)).status).toBe(404);

    // 5 por minuto por IP (já foram 4 chamadas que passaram pelo guard)
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) statuses.push((await call(null, 'POST', '/waitlist', { ...good, email: `x${i}@teste.local` }, ip)).status);
    expect(statuses).toEqual([200, 429, 429]);

    // /admin: 401 sem sessão, 403 para não admin, ok para admin; a lista só aparece lá
    for (const path of ['/admin/me', '/admin/stats', '/admin/waitlist', '/admin/invites']) {
      expect((await call(null, 'GET', path)).status).toBe(401);
      expect((await call(to, 'GET', path)).status).toBe(403);
      expect((await call(ta, 'GET', path)).status).toBe(200);
    }
    expect((await call(to, 'POST', '/admin/invites', { label: 'x', maxUses: 1 })).status).toBe(403);
    expect(JSON.parse((await call(ta, 'GET', '/admin/me')).text)).toEqual({ admin: true });
    const list = JSON.parse((await call(ta, 'GET', '/admin/waitlist')).text);
    expect(list.items.map((i: any) => i.email)).toContain('fila@teste.local');
    expect(JSON.stringify(list)).not.toContain('consentAt');
    // convite via painel + providers públicos
    const inv = JSON.parse((await call(ta, 'POST', '/admin/waitlist/' + list.items[0].id + '/invite')).text);
    expect(inv.link).toBe(`https://bocado.test/register?invite=${inv.code}`);
    const providers = JSON.parse((await call(null, 'GET', '/auth/providers')).text);
    expect(providers).toMatchObject({ registration: 'open', seatsOpen: true });
    expect((await call(to, 'POST', '/admin/invites', { label: 'x', maxUses: 99 })).status).toBe(403);
    expect((await call(ta, 'POST', '/admin/invites', { label: 'x', maxUses: 99 })).status).toBe(400);
    expect((await call(ta, 'POST', '/admin/invites', { label: 'x', maxUses: 3 })).status).toBe(201);
  });

  it('o preview devolve só nome da casa e primeiro nome; todo código ruim dá o mesmo 404', async () => {
    const { a, ta } = await scenario();
    const invite = JSON.parse((await call(ta, 'POST', '/household/invites')).text);
    const ok = await call(null, 'GET', `/invites/${invite.code}/preview`);
    expect(JSON.parse(ok.text)).toEqual({ householdName: 'Casa', inviterFirstName: a.name.split(' ')[0] });
    expect(ok.text).not.toContain(a.email);
    const bad = await call(null, 'GET', '/invites/AAAAAAAA/preview');
    expect(bad.status).toBe(404);
    await call(ta, 'DELETE', `/household/invites/${invite.id}`);
    const revoked = await call(null, 'GET', `/invites/${invite.code}/preview`);
    expect({ status: revoked.status, text: revoked.text }).toEqual({ status: bad.status, text: bad.text });
  });

  it('rate limit: preview público (20/min por IP), join (10/min por usuário) e refeição dividida (20/min)', async () => {
    const u = await makeUser(prisma, 'Caio');
    const tu = tokenOf(u);

    const preview: number[] = [];
    for (let i = 0; i < 22; i++) preview.push((await call(null, 'GET', '/invites/ZZZZZZZZ/preview', undefined, '10.9.9.9')).status);
    expect(preview.slice(0, 20).every((s) => s === 404)).toBe(true);
    expect(preview.slice(20).every((s) => s === 429)).toBe(true);

    const join: number[] = [];
    for (let i = 0; i < 12; i++) join.push((await call(tu, 'POST', '/household/join', { code: 'ZZZZZZZZ' })).status);
    expect(join.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(join.slice(10).every((s) => s === 429)).toBe(true);

    const bad = { date: '2026-11-10', type: 'DINNER', items: [], participants: [] };
    const sharedCalls: number[] = [];
    for (let i = 0; i < 22; i++) sharedCalls.push((await call(tu, 'POST', '/meals/shared', bad)).status);
    expect(sharedCalls.slice(0, 20).every((s) => s === 400)).toBe(true);
    expect(sharedCalls.slice(20).every((s) => s === 429)).toBe(true);
  });
});

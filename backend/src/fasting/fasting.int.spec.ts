import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { assertHealthAccess } from '../glp1/glp1.access';
import type { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { StartFastDto } from './dto/fasting.dto';
import { FastingService } from './fasting.service';

const H = 3_600_000;

describe('StartFastDto: limites de horas', () => {
  const check = (raw: Record<string, unknown>) => validate(plainToInstance(StartFastDto, raw));
  it('aceita de 12 a 20 horas', async () => {
    for (const h of [12, 14, 16, 18, 20]) expect(await check({ targetHours: h })).toHaveLength(0);
  });
  it('recusa fora de 12 a 20, decimais e texto', async () => {
    for (const h of [11, 21, 0, -16, 16.5, '16', null]) expect(await check({ targetHours: h })).not.toHaveLength(0);
  });
  it('o início precisa ser ISO 8601', async () => {
    expect(await check({ targetHours: 16, startedAt: '2026-11-19T10:00:00.000Z' })).toHaveLength(0);
    expect(await check({ targetHours: 16, startedAt: 'ontem' })).not.toHaveLength(0);
  });
});

describeDb('Jejum intermitente (banco real)', () => {
  let prisma: PrismaService;
  let fasting: FastingService;
  let profiles: ProfileService;

  beforeAll(() => {
    prisma = createTestPrisma();
    fasting = new FastingService(prisma);
    profiles = new ProfileService(prisma);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  const profile = (userId: string, over: Record<string, unknown> = {}) =>
    prisma.profile.create({
      data: {
        userId, sex: 'MALE', birthDate: new Date('1990-01-01T00:00:00Z'), heightCm: 175, weightKg: 80,
        activityLevel: 'MODERATE', goal: 'MAINTAIN', kcalTarget: 2200, proteinTarget: 120, carbsTarget: 250, fatTarget: 70,
        fastingEnabled: true, ...over,
      },
    });
  const iso = (ms: number) => new Date(ms).toISOString();

  it('uma sessão ativa por vez (409), inclusive no banco (índice parcial)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    await fasting.start(u.id, { targetHours: 16 });
    await expect(fasting.start(u.id, { targetHours: 14 })).rejects.toBeInstanceOf(ConflictException);
    // Direto no banco, sem passar pela checagem do serviço, o índice único parcial também recusa
    await expect(prisma.fastingSession.create({ data: { userId: u.id, startedAt: new Date(), targetHours: 12 } })).rejects.toThrow();
    // Dois pedidos simultâneos: só um vence
    const v = await makeUser(prisma);
    await profile(v.id);
    const results = await Promise.allSettled([fasting.start(v.id, { targetHours: 16 }), fasting.start(v.id, { targetHours: 16 })]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: expect.any(ConflictException) });
  });

  it('o banco recusa horas fora de 12 a 20', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    await expect(prisma.fastingSession.create({ data: { userId: u.id, startedAt: new Date(), targetHours: 25, endedAt: new Date() } })).rejects.toThrow();
  });

  it('início no passado: até 24 h; no futuro ou além de 24 h é recusado', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const now = new Date();
    await expect(fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() - 25 * H) }, now)).rejects.toBeInstanceOf(BadRequestException);
    await expect(fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() + 3 * H) }, now)).rejects.toBeInstanceOf(BadRequestException);
    const ok = await fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() - 11 * H - 20 * 60_000) }, now);
    expect(ok.startedAt).toBe(iso(now.getTime() - 11 * H - 20 * 60_000)); // UTC ISO
    expect(ok.endedAt).toBeNull();
    expect((await fasting.current(u.id))?.id).toBe(ok.id);
  });

  it('encerrar: guarda o horário, calcula a duração, e não encerra duas vezes', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const now = new Date();
    const s = await fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() - 11 * H - 20 * 60_000) }, now);
    const ended = await fasting.end(u.id, s.id, {}, now); // antes da meta é normal
    expect(ended.endedAt).toBe(now.toISOString());
    expect(ended.durationMinutes).toBe(11 * 60 + 20);
    expect(await fasting.current(u.id)).toBeNull();
    await expect(fasting.end(u.id, s.id, {}, now)).rejects.toBeInstanceOf(ConflictException);
    // Agora pode iniciar outra
    await expect(fasting.start(u.id, { targetHours: 18 }, now)).resolves.toBeDefined();
  });

  it('encerrar com horário antes do início ou no futuro é recusado', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const now = new Date();
    const s = await fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() - 5 * H) }, now);
    await expect(fasting.end(u.id, s.id, { endedAt: iso(now.getTime() - 6 * H) }, now)).rejects.toBeInstanceOf(BadRequestException);
    await expect(fasting.end(u.id, s.id, { endedAt: iso(now.getTime() + 2 * H) }, now)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('editar horário e nota; apagar; listar por período', async () => {
    const u = await makeUser(prisma);
    await profile(u.id);
    const now = new Date();
    const s = await fasting.start(u.id, { targetHours: 16, startedAt: iso(now.getTime() - 5 * H) }, now);
    const edited = await fasting.update(u.id, s.id, { startedAt: iso(now.getTime() - 8 * H), targetHours: 14, note: ' tranquilo ' }, now);
    expect(edited).toMatchObject({ targetHours: 14, note: 'tranquilo', startedAt: iso(now.getTime() - 8 * H) });
    await fasting.end(u.id, s.id, {}, now);
    const list = await fasting.range(u.id, iso(now.getTime() - 48 * H), iso(now.getTime() + H));
    expect(list.sessions).toHaveLength(1);
    await fasting.remove(u.id, s.id);
    expect((await fasting.range(u.id, iso(now.getTime() - 48 * H), iso(now.getTime() + H))).sessions).toHaveLength(0);
  });

  it('posse: outra pessoa não vê, encerra, edita nem apaga a sessão', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    await profile(a.id);
    await profile(b.id);
    const s = await fasting.start(a.id, { targetHours: 16 });
    expect(await fasting.current(b.id)).toBeNull();
    expect((await fasting.range(b.id, new Date(Date.now() - 24 * H).toISOString(), new Date(Date.now() + H).toISOString())).sessions).toEqual([]);
    await expect(fasting.end(b.id, s.id, {})).rejects.toBeInstanceOf(NotFoundException);
    await expect(fasting.update(b.id, s.id, { note: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(fasting.remove(b.id, s.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await fasting.current(a.id))?.endedAt).toBeNull();
  });

  it('menor de 18 anos: 403 neutro (não liga a preferência e a rota recusa)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { fastingEnabled: false, birthDate: new Date(Date.now() - 16 * 365.25 * 86_400_000) });
    await expect(profiles.updatePreferences(u.id, { fastingEnabled: true })).rejects.toBeInstanceOf(ForbiddenException);
    await prisma.profile.update({ where: { userId: u.id }, data: { fastingEnabled: true } }); // estado forçado
    await expect(assertHealthAccess(prisma, u.id, ['fastingEnabled'])).rejects.toThrow('menores de 18');
  });

  it('com a preferência desligada, a rota recusa (403 neutro)', async () => {
    const u = await makeUser(prisma);
    await profile(u.id, { fastingEnabled: false });
    await expect(assertHealthAccess(prisma, u.id, ['fastingEnabled'])).rejects.toThrow('não está ativado');
  });
});

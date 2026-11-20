import 'reflect-metadata';
import { ForbiddenException, HttpException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { formatDay } from '../common/dates';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { addDays } from '../weight/weight.math';
import { CreateShareDto, UnlockShareDto } from './dto/reports.dto';
import { ReportsService } from './reports.service';
import { CODE_ALPHABET, cookiePaths, generateCode, MSG } from './share';
import { ReportSharesService } from './shares.service';

const MIN = 60_000;

describe('código e cookie (puros)', () => {
  it('8 caracteres do alfabeto sem ambíguos (sem 0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateCode();
      expect(c).toHaveLength(8);
      expect([...c].every((ch) => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(c).not.toMatch(/[01OIL]/);
    }
  });
  it('o cookie de aparelho vale só na página e na API daquele link', () => {
    expect(cookiePaths('abc')).toEqual(['/r/abc', '/api/public/reports/abc']);
  });
  it('o código é obrigatório: o desbloqueio exige o campo e o criar não aceita "sem código"', async () => {
    expect(await validate(plainToInstance(UnlockShareDto, {}))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UnlockShareDto, { code: 'ABCD2345' }))).toHaveLength(0);
    const base = { from: '2026-11-01', to: '2026-11-19', expiresInDays: 7 };
    expect(await validate(plainToInstance(CreateShareDto, base))).toHaveLength(0);
    // Campos extras como "noCode" são recusados pelo ValidationPipe global (whitelist + forbidNonWhitelisted); validade e aparelhos são limitados
    expect(await validate(plainToInstance(CreateShareDto, { ...base, expiresInDays: 365 }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(CreateShareDto, { ...base, maxDevices: 3 }))).not.toHaveLength(0);
  });
});

describeDb('Link compartilhável do relatório (banco real)', () => {
  let prisma: PrismaService;
  let shares: ReportSharesService;

  beforeAll(() => {
    prisma = createTestPrisma();
    shares = new ReportSharesService(prisma, new ReportsService(prisma), new ConfigService({ JWT_SECRET: 'segredo-de-teste-com-mais-de-32-caracteres' }));
  });
  afterAll(async () => {
    await prisma.reportShareIpLock.deleteMany();
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.reportShareIpLock.deleteMany();
    await cleanDb(prisma);
  });

  const today = formatDay(new Date());
  const owner = async () => {
    const u = await makeUser(prisma);
    await prisma.profile.create({
      data: { userId: u.id, sex: 'MALE', birthDate: new Date('1990-01-01T00:00:00Z'), heightCm: 180, weightKg: 85, activityLevel: 'MODERATE', goal: 'MAINTAIN', kcalTarget: 2200, proteinTarget: 140, carbsTarget: 250, fatTarget: 70 },
    });
    return u;
  };
  const make = async (userId: string, maxDevices = 1) => shares.create(userId, { from: addDays(today, -6), to: today, expiresInDays: 7, maxDevices });
  const wrong = (token: string, ip = '1.1.1.1', now = new Date()) => shares.unlock(token, 'ZZZZZZZZ', ip, undefined, now).catch((e) => e);

  it('o servidor gera o código, devolve UMA vez e guarda só o bcrypt', async () => {
    const u = await owner();
    const s = await make(u.id);
    expect(s.code).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    const row = await prisma.reportShare.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.codeHash).not.toContain(s.code);
    expect(await bcrypt.compare(s.code, row.codeHash)).toBe(true);
    // a listagem nunca repete o código
    expect(JSON.stringify(await shares.list(u.id))).not.toContain(s.code);
  });

  it('GET sem cookie (prévia de mensagem, antivírus) só vê o formulário e NUNCA consome vaga', async () => {
    const u = await owner();
    const s = await make(u.id);
    for (let i = 0; i < 5; i++) expect(await shares.view(s.token, undefined)).toEqual({ state: 'code' });
    expect(await shares.view(s.token, 'cookie-inventado')).toEqual({ state: 'code' });
    expect(await shares.view('token-que-nao-existe-123456', undefined)).toEqual({ state: 'code' }); // mesma resposta: nada é revelado
    expect(await prisma.reportShareDevice.count()).toBe(0);
  });

  it('o primeiro desbloqueio libera o aparelho e abre o relatório; o segundo aparelho é negado com maxDevices = 1', async () => {
    const u = await owner();
    const s = await make(u.id, 1);
    const first = await shares.unlock(s.token, s.code, '2.2.2.2', undefined);
    expect(first.created).toBe(true);
    const view = await shares.view(s.token, first.deviceToken);
    expect(view.state).toBe('report');
    await expect(shares.unlock(s.token, s.code, '3.3.3.3', undefined)).rejects.toThrow(MSG.noSlot);
    await expect(shares.unlock(s.token, s.code, '3.3.3.3', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(await prisma.reportShareDevice.count()).toBe(1);
    // o mesmo aparelho pode digitar o código de novo sem gastar outra vaga
    const again = await shares.unlock(s.token, s.code, '2.2.2.2', first.deviceToken);
    expect(again).toMatchObject({ created: false, deviceToken: first.deviceToken });
  });

  it('com maxDevices = 2 o segundo aparelho é aceito e o terceiro, negado', async () => {
    const u = await owner();
    const s = await make(u.id, 2);
    const a = await shares.unlock(s.token, s.code, '1.0.0.1', undefined);
    const b = await shares.unlock(s.token, s.code, '1.0.0.2', undefined);
    expect(a.deviceToken).not.toBe(b.deviceToken);
    await expect(shares.unlock(s.token, s.code, '1.0.0.3', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await shares.view(s.token, b.deviceToken)).state).toBe('report');
  });

  it('dois desbloqueios ao mesmo tempo com 1 vaga: só um passa', async () => {
    const u = await owner();
    const s = await make(u.id, 1);
    const results = await Promise.allSettled([shares.unlock(s.token, s.code, '9.9.9.1', undefined), shares.unlock(s.token, s.code, '9.9.9.2', undefined)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.reportShareDevice.count()).toBe(1);
  });

  it('o cookie de aparelho de um link não abre outro link', async () => {
    const u = await owner();
    const a = await make(u.id);
    const b = await make(u.id);
    const dev = await shares.unlock(a.token, a.code, '4.4.4.4', undefined);
    expect((await shares.view(b.token, dev.deviceToken)).state).toBe('code');
  });

  it('link expirado ou revogado volta ao formulário e não desbloqueia', async () => {
    const u = await owner();
    const s = await make(u.id);
    const dev = await shares.unlock(s.token, s.code, '5.5.5.5', undefined);
    const later = new Date(Date.now() + 8 * 86_400_000);
    expect((await shares.view(s.token, dev.deviceToken, later)).state).toBe('code');
    await expect(shares.unlock(s.token, s.code, '5.5.5.5', undefined, later)).rejects.toBeInstanceOf(UnauthorizedException);
    await shares.revoke(u.id, s.id);
    expect((await shares.view(s.token, dev.deviceToken)).state).toBe('code');
  });

  it('5 erros bloqueiam o LINK por 15 minutos (mesmo com o código certo) e depois liberam', async () => {
    const u = await owner();
    const s = await make(u.id);
    const t0 = new Date();
    for (let i = 0; i < 5; i++) expect(await wrong(s.token, `7.7.7.${i}`, t0)).toBeInstanceOf(UnauthorizedException);
    const locked = await shares.unlock(s.token, s.code, '8.8.8.8', undefined, t0).catch((e) => e);
    expect(locked).toBeInstanceOf(HttpException);
    expect((locked as HttpException).getStatus()).toBe(429);
    const after = new Date(t0.getTime() + 16 * MIN);
    expect((await shares.unlock(s.token, s.code, '8.8.8.8', undefined, after)).created).toBe(true);
  });

  it('5 erros do mesmo IP bloqueiam o IP em qualquer link', async () => {
    const u = await owner();
    const a = await make(u.id);
    const b = await make(u.id);
    const t0 = new Date();
    for (let i = 0; i < 5; i++) await wrong(i % 2 ? a.token : b.token, '6.6.6.6', t0);
    const blocked = await shares.unlock(b.token, b.code, '6.6.6.6', undefined, t0).catch((e) => e);
    expect((blocked as HttpException).getStatus()).toBe(429);
    // outro IP continua livre
    expect((await shares.unlock(b.token, b.code, '6.6.6.7', undefined, t0)).created).toBe(true);
  });

  it('depois de 3 bloqueios o link é revogado sozinho e a pessoa é avisada', async () => {
    const u = await owner();
    const s = await make(u.id);
    let now = new Date();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 5; i++) await wrong(s.token, `10.${round}.0.${i}`, now);
      now = new Date(now.getTime() + 16 * MIN);
    }
    const row = await prisma.reportShare.findUniqueOrThrow({ where: { id: s.id } });
    expect(row).toMatchObject({ revokedReason: 'BLOCKS', lockCount: 3 });
    expect(row.revokedAt).not.toBeNull();
    await expect(shares.unlock(s.token, s.code, '11.0.0.1', undefined, now)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await shares.list(u.id))[0].status).toBe('blocked');
    expect((await shares.notices(u.id)).blocked).toEqual([{ linkId: s.id }]);
    await shares.markNoticesSeen(u.id);
    expect((await shares.notices(u.id)).blocked).toEqual([]);
  });

  it('aviso de abertura: "aparelho 1 de 1", uma vez; e a lista mostra aparelhos usados e a última abertura', async () => {
    const u = await owner();
    const s = await make(u.id, 2);
    expect((await shares.notices(u.id)).opened).toEqual([]);
    await shares.unlock(s.token, s.code, '12.0.0.1', undefined);
    const n = await shares.notices(u.id);
    expect(n.opened).toMatchObject([{ linkId: s.id, deviceNumber: 1, maxDevices: 2, revoked: false }]);
    expect(JSON.stringify(n)).not.toMatch(/12\.0\.0\.1|deviceToken/); // sem IP nem identificação do aparelho
    await shares.markNoticesSeen(u.id);
    expect((await shares.notices(u.id)).opened).toEqual([]);
    const [item] = await shares.list(u.id);
    expect(item).toMatchObject({ devicesUsed: 1, maxDevices: 2, status: 'active' });
    expect(item.lastOpenedAt).not.toBeNull();
  });

  it('"Liberar aparelhos" apaga os aparelhos e o mesmo código serve para um novo; só o dono pode', async () => {
    const u = await owner();
    const other = await owner();
    const s = await make(u.id, 1);
    const dev = await shares.unlock(s.token, s.code, '13.0.0.1', undefined);
    await expect(shares.unlock(s.token, s.code, '13.0.0.2', undefined)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(shares.releaseDevices(other.id, s.id)).rejects.toBeInstanceOf(NotFoundException);
    expect(await shares.releaseDevices(u.id, s.id)).toEqual({ released: 1 });
    expect((await shares.view(s.token, dev.deviceToken)).state).toBe('code'); // o cookie antigo deixa de valer
    expect((await shares.unlock(s.token, s.code, '13.0.0.2', undefined)).created).toBe(true);
  });

  it('posse: outra pessoa não vê, revoga nem lista os links', async () => {
    const u = await owner();
    const other = await owner();
    const s = await make(u.id);
    expect(await shares.list(other.id)).toEqual([]);
    await expect(shares.revoke(other.id, s.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await shares.notices(other.id)).opened).toEqual([]);
  });

  it('excluir a conta apaga links e aparelhos (Cascade)', async () => {
    const u = await owner();
    const s = await make(u.id);
    await shares.unlock(s.token, s.code, '14.0.0.1', undefined);
    await prisma.user.delete({ where: { id: u.id } });
    expect(await prisma.reportShare.count()).toBe(0);
    expect(await prisma.reportShareDevice.count()).toBe(0);
  });
});

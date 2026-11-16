/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ConfigService } from '@nestjs/config';
import { AiUsageAdminService } from '../admin/ai-usage-admin.service';
import { AccountService } from '../account/account.service';
import { BetaConfig } from '../beta/beta.config';
import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { AiQuotaExceededError, AiQuotaService } from './ai-quota.service';
import { AiUsageConfig } from './ai-usage.config';

const PRICES = JSON.stringify({ 'modelo-a': { inPerMTok: 3, outPerMTok: 15 }, 'modelo-b': { inPerMTok: 1, outPerMTok: 5 } });
// 12:00 em São Paulo
const NOW = new Date('2026-11-16T15:00:00Z');
const model = 'modelo-a';

describeDb('Cota e custo da IA (banco real)', () => {
  let prisma: PrismaService;
  let env: Record<string, string | undefined>;

  beforeAll(() => {
    prisma = createTestPrisma();
  });
  afterAll(async () => {
    await prisma.aiUsage.deleteMany();
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.aiUsage.deleteMany();
    await cleanDb(prisma);
    env = { APP_URL: 'https://bocado.test', ANTHROPIC_MODEL: model };
  });

  const build = () => {
    const config = { get: (k: string) => env[k], getOrThrow: (k: string) => env[k] } as unknown as ConfigService;
    const cfg = new AiUsageConfig(config);
    const beta = new BetaConfig(config);
    const quota = new AiQuotaService(prisma, cfg, beta);
    const admin = new AiUsageAdminService(prisma, cfg, quota, beta);
    return { cfg, quota, admin, beta };
  };
  const caught = async (p: Promise<unknown>): Promise<AiQuotaExceededError> => {
    try {
      await p;
    } catch (e) {
      expect(e).toBeInstanceOf(AiQuotaExceededError);
      return e as AiQuotaExceededError;
    }
    throw new Error('deveria ter recusado');
  };
  const use = async (userId: string, feature: 'PHOTO' | 'TEXT' | 'LABEL' | 'SUGGEST', at: Date, over: Record<string, unknown> = {}) =>
    prisma.aiUsage.create({ data: { userId, feature, model, status: 'OK', inputTokens: 1000, outputTokens: 200, createdAt: at, settledAt: at, ...over } as any });

  // ---------------------------------------------------------------- limites
  describe('limites', () => {
    it('limite diário por funcionalidade: a 9ª foto é recusada, mas texto e rótulo seguem livres', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      for (let i = 0; i < 8; i++) await quota.settle(await quota.reserve(u.id, 'PHOTO', model, NOW));
      const err = await caught(quota.reserve(u.id, 'PHOTO', model, NOW));
      expect(err.body).toMatchObject({ code: 'AI_QUOTA_DAILY', feature: 'PHOTO', limit: 8, used: 8 });
      expect(err.getStatus()).toBe(429);
      await expect(quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
      await expect(quota.reserve(u.id, 'LABEL', model, NOW)).resolves.toBeDefined();
    });

    it('padrões: foto 8, texto 15, rótulo 4, sugestão 3, mês 200', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      const q = await quota.quota(u.id, NOW);
      expect(Object.fromEntries(Object.entries(q.features).map(([k, v]) => [k, v.limit]))).toEqual({ PHOTO: 8, TEXT: 15, LABEL: 4, SUGGEST: 3 });
      expect(q.monthly.limit).toBe(200);
    });

    it('limites configuráveis por variável de ambiente', async () => {
      env.AI_DAILY_LIMIT_PHOTO = '2';
      env.AI_MONTHLY_LIMIT_TOTAL = '50';
      const { quota } = build();
      const u = await makeUser(prisma);
      const q = await quota.quota(u.id, NOW);
      expect([q.features.PHOTO.limit, q.monthly.limit]).toEqual([2, 50]);
    });

    it('limite mensal soma todas as funcionalidades e vale mesmo com o diário livre', async () => {
      env.AI_MONTHLY_LIMIT_TOTAL = '5';
      const { quota } = build();
      const u = await makeUser(prisma);
      // 5 usos em dias anteriores do mesmo mês
      for (let i = 0; i < 5; i++) await use(u.id, 'PHOTO', new Date('2026-11-05T15:00:00Z'));
      const err = await caught(quota.reserve(u.id, 'TEXT', model, NOW));
      expect(err.body).toMatchObject({ code: 'AI_QUOTA_MONTHLY', limit: 5, used: 5, resetsAt: '2026-12-01T03:00:00.000Z' });
      expect(err.body.message).toContain('01/12');
    });

    it('fator 0 bloqueia (AI_BLOCKED), 1 é o padrão e 2 dobra os limites', async () => {
      const { quota } = build();
      const [zero, two] = [await makeUser(prisma, 'Zero'), await makeUser(prisma, 'Dois')];
      await prisma.user.update({ where: { id: zero.id }, data: { aiLimitFactor: 0 } });
      await prisma.user.update({ where: { id: two.id }, data: { aiLimitFactor: 2 } });
      const err = await caught(quota.reserve(zero.id, 'PHOTO', model, NOW));
      expect(err.body.code).toBe('AI_BLOCKED');
      expect(err.body.message).toMatch(/busca, código de barras ou manual/);

      for (let i = 0; i < 16; i++) await quota.settle(await quota.reserve(two.id, 'PHOTO', model, NOW));
      expect((await caught(quota.reserve(two.id, 'PHOTO', model, NOW))).body).toMatchObject({ code: 'AI_QUOTA_DAILY', limit: 16 });
      expect((await quota.quota(two.id, NOW)).monthly.limit).toBe(400);
    });

    it('admin fica isento dos limites por usuário (e do bloqueio)', async () => {
      const { quota, cfg } = build();
      void cfg;
      const admin = await makeUser(prisma, 'Admin');
      env.ADMIN_EMAILS = admin.email;
      await prisma.user.update({ where: { id: admin.id }, data: { aiLimitFactor: 0 } });
      const q2 = build().quota;
      for (let i = 0; i < 12; i++) await q2.settle(await q2.reserve(admin.id, 'PHOTO', model, NOW));
      expect(await prisma.aiUsage.count({ where: { userId: admin.id } })).toBe(12);
      expect(await q2.remaining(admin.id, 'PHOTO', NOW)).toBeGreaterThanOrEqual(1);
      void quota;
    });

    it('"dia" e "mês" seguem America/Sao_Paulo: 23:59 e 00:00 locais', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      env.AI_DAILY_LIMIT_PHOTO = '1';
      const q = build().quota;
      await use(u.id, 'PHOTO', new Date('2026-11-17T02:59:00Z')); // 23:59 de 16/11 em SP
      const late = new Date('2026-11-17T02:59:59Z');
      expect((await caught(q.reserve(u.id, 'PHOTO', model, late))).body.code).toBe('AI_QUOTA_DAILY');
      // 00:00 de 17/11 em SP: novo dia, a cota volta
      await expect(q.reserve(u.id, 'PHOTO', model, new Date('2026-11-17T03:00:00Z'))).resolves.toBeDefined();
      void quota;
    });

    it('virada de mês: o uso de novembro não conta em dezembro', async () => {
      env.AI_MONTHLY_LIMIT_TOTAL = '1';
      const { quota } = build();
      const u = await makeUser(prisma);
      await use(u.id, 'TEXT', new Date('2026-12-01T02:30:00Z')); // 23:30 de 30/11 em SP
      expect((await caught(quota.reserve(u.id, 'TEXT', model, new Date('2026-12-01T02:59:59Z')))).body.code).toBe('AI_QUOTA_MONTHLY');
      await expect(quota.reserve(u.id, 'TEXT', model, new Date('2026-12-01T03:00:00Z'))).resolves.toBeDefined();
    });

    it('os dados de /ai/quota são só do próprio usuário', async () => {
      const { quota } = build();
      const [a, b] = [await makeUser(prisma, 'A'), await makeUser(prisma, 'B')];
      for (let i = 0; i < 3; i++) await use(a.id, 'PHOTO', NOW);
      expect((await quota.quota(a.id, NOW)).features.PHOTO.used).toBe(3);
      expect((await quota.quota(b.id, NOW)).features.PHOTO.used).toBe(0);
      expect(JSON.stringify(await quota.quota(b.id, NOW))).not.toContain(a.id);
    });
  });

  // ---------------------------------------------------------------- ciclo de vida
  describe('reserva, settle e falha', () => {
    it('settle grava os tokens do SDK e fecha como OK', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      const id = await quota.reserve(u.id, 'TEXT', model, NOW);
      expect((await prisma.aiUsage.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
      await quota.settle(id, { input_tokens: 1234, output_tokens: 321 });
      expect(await prisma.aiUsage.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'OK', inputTokens: 1234, outputTokens: 321, model, feature: 'TEXT' });
    });

    it('sem usage do SDK, grava 0 tokens (sem bloquear)', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      const id = await quota.reserve(u.id, 'TEXT', model, NOW);
      await quota.settle(id, undefined);
      expect(await prisma.aiUsage.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'OK', inputTokens: 0, outputTokens: 0 });
    });

    it('falha NÃO consome cota: depois de falhar, a vaga volta', async () => {
      env.AI_DAILY_LIMIT_PHOTO = '1';
      const { quota } = build();
      const u = await makeUser(prisma);
      await quota.fail(await quota.reserve(u.id, 'PHOTO', model, NOW));
      await quota.fail(await quota.reserve(u.id, 'PHOTO', model, NOW));
      const ok = await quota.reserve(u.id, 'PHOTO', model, NOW);
      await quota.settle(ok);
      expect((await caught(quota.reserve(u.id, 'PHOTO', model, NOW))).body.used).toBe(1);
      expect(await prisma.aiUsage.count({ where: { userId: u.id, status: 'FAILED' } })).toBe(2);
    });

    it('settle e fail são idempotentes: não mudam uma reserva já fechada', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      const id = await quota.reserve(u.id, 'TEXT', model, NOW);
      await quota.settle(id, { input_tokens: 10, output_tokens: 5 });
      await quota.fail(id);
      await quota.settle(id, { input_tokens: 999, output_tokens: 999 });
      expect(await prisma.aiUsage.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: 'OK', inputTokens: 10, outputTokens: 5 });
    });

    it('PENDING conta na cota; PENDING com mais de 10 min vira FAILED e deixa de contar', async () => {
      env.AI_DAILY_LIMIT_PHOTO = '1';
      const { quota } = build();
      const u = await makeUser(prisma);
      const t0 = new Date();
      const old = await prisma.aiUsage.create({ data: { userId: u.id, feature: 'PHOTO', model, status: 'PENDING', createdAt: new Date(t0.getTime() - 11 * 60_000) } });
      // PENDING antigo já não bloqueia (mesmo antes da limpeza)…
      const fresh = await quota.reserve(u.id, 'PHOTO', model, t0);
      // …e o recente bloqueia
      expect((await caught(quota.reserve(u.id, 'PHOTO', model, t0))).body.code).toBe('AI_QUOTA_DAILY');
      const swept = await quota.sweep(t0);
      expect(swept.stale).toBe(1);
      expect((await prisma.aiUsage.findUniqueOrThrow({ where: { id: old.id } })).status).toBe('FAILED');
      expect((await prisma.aiUsage.findUniqueOrThrow({ where: { id: fresh } })).status).toBe('PENDING');
    });

    it('limpeza apaga registros com mais de 13 meses', async () => {
      const { quota } = build();
      const u = await makeUser(prisma);
      const now = new Date('2026-11-16T15:00:00Z');
      await use(u.id, 'TEXT', new Date('2025-09-01T12:00:00Z')); // 14 meses
      await use(u.id, 'TEXT', new Date('2025-11-20T12:00:00Z')); // < 13 meses
      expect((await quota.sweep(now)).removed).toBe(1);
      expect(await prisma.aiUsage.count()).toBe(1);
    });

    it('concorrência: 10 reservas simultâneas com 1 vaga restante, só 1 passa', async () => {
      env.AI_DAILY_LIMIT_PHOTO = '4';
      const { quota } = build();
      const u = await makeUser(prisma);
      for (let i = 0; i < 3; i++) await use(u.id, 'PHOTO', NOW);
      const results = await Promise.allSettled(Array.from({ length: 10 }, () => quota.reserve(u.id, 'PHOTO', model, NOW)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof AiQuotaExceededError)).toHaveLength(9);
      expect(await prisma.aiUsage.count({ where: { userId: u.id, feature: 'PHOTO' } })).toBe(4);
    });
  });

  // ---------------------------------------------------------------- orçamento
  describe('orçamento global do mês', () => {
    // cada linha: 1M tokens de entrada no modelo-a = US$ 3
    const spend = async (u: { id: string }, n: number) => {
      for (let i = 0; i < n; i++) await use(u.id, 'TEXT', new Date('2026-11-10T15:00:00Z'), { inputTokens: 1_000_000, outputTokens: 0 });
    };

    it('abaixo do orçamento passa; no limite e acima recusa com AI_BUDGET_PAUSED', async () => {
      env.AI_PRICES_JSON = PRICES;
      env.AI_MONTHLY_BUDGET_USD = '9';
      const { quota } = build();
      const u = await makeUser(prisma);
      await spend(u, 2); // US$ 6 de 9
      await expect(quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
      await spend(u, 1); // US$ 9 = 100%
      const err = await caught(quota.reserve(u.id, 'TEXT', model, NOW));
      expect(err.body).toMatchObject({ code: 'AI_BUDGET_PAUSED', resetsAt: '2026-12-01T03:00:00.000Z' });
      expect(err.body.message).toBe('A análise por IA está em pausa por enquanto no beta. Você continua podendo registrar por busca, código de barras ou manual.');
      await spend(u, 3); // acima
      expect((await caught(quota.reserve(u.id, 'TEXT', model, NOW))).body.code).toBe('AI_BUDGET_PAUSED');
      expect(await quota.isPaused(NOW)).toBe(true);
      expect((await quota.quota(u.id, NOW)).paused).toBe(true);
    });

    it('o orçamento vale para todos, inclusive admin (que só é isento dos limites por usuário)', async () => {
      env.AI_PRICES_JSON = PRICES;
      env.AI_MONTHLY_BUDGET_USD = '3';
      const admin = await makeUser(prisma, 'Admin');
      env.ADMIN_EMAILS = admin.email;
      const { quota } = build();
      await spend(admin, 1);
      expect((await caught(quota.reserve(admin.id, 'TEXT', model, NOW))).body.code).toBe('AI_BUDGET_PAUSED');
    });

    it('só OK e PENDING contam; FAILED não; o mês anterior não conta', async () => {
      env.AI_PRICES_JSON = PRICES;
      env.AI_MONTHLY_BUDGET_USD = '3';
      const { quota } = build();
      const u = await makeUser(prisma);
      await use(u.id, 'TEXT', new Date('2026-11-10T15:00:00Z'), { status: 'FAILED', inputTokens: 5_000_000 });
      await use(u.id, 'TEXT', new Date('2026-10-20T15:00:00Z'), { inputTokens: 5_000_000 });
      await expect(quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
    });

    it('sem preços mapeados para o modelo, o orçamento em dólares NÃO bloqueia', async () => {
      env.AI_MONTHLY_BUDGET_USD = '0.01'; // sem AI_PRICES_JSON
      const { quota } = build();
      const u = await makeUser(prisma);
      await spend(u, 5);
      await expect(quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
      expect(await quota.isPaused(NOW)).toBe(false);
      // preço só de OUTRO modelo: o modelo em uso continua sem orçamento
      env.AI_PRICES_JSON = JSON.stringify({ 'outro-modelo': { inPerMTok: 1, outPerMTok: 1 } });
      await expect(build().quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
    });

    it('sem AI_MONTHLY_BUDGET_USD não há teto global', async () => {
      env.AI_PRICES_JSON = PRICES;
      const { quota } = build();
      const u = await makeUser(prisma);
      await spend(u, 50);
      await expect(quota.reserve(u.id, 'TEXT', model, NOW)).resolves.toBeDefined();
    });

    it('PENDING entra na estimativa (média por chamada OK)', async () => {
      env.AI_PRICES_JSON = PRICES;
      env.AI_MONTHLY_BUDGET_USD = '7';
      const { quota } = build();
      const u = await makeUser(prisma);
      await spend(u, 2); // US$ 6, média 3 por chamada
      await prisma.aiUsage.create({ data: { userId: u.id, feature: 'PHOTO', model, status: 'PENDING', createdAt: new Date() } });
      // 6 + 1 PENDING x 3 = 9 >= 7
      expect((await caught(quota.reserve(u.id, 'TEXT', model, new Date()))).body.code).toBe('AI_BUDGET_PAUSED');
    });
  });

  // ---------------------------------------------------------------- admin: uso e custo
  describe('painel de uso (admin)', () => {
    it('sem preços: custo null (não configurado), sem orçamento ativo e sem projeção inventada', async () => {
      const { admin } = build();
      const u = await makeUser(prisma);
      await use(u.id, 'PHOTO', new Date('2026-11-10T15:00:00Z'));
      const r = await admin.usage(30, NOW);
      expect(r.month).toMatchObject({ calls: 1, inputTokens: 1000, outputTokens: 200, estimatedCostUsd: null, budgetActive: false, pricesConfigured: false });
      expect(r.month).not.toHaveProperty('projectedCostUsd');
      expect(r.perActiveUser.averageCostUsd).toBeNull();
      expect(r.byUser[0].estimatedCostUsd).toBeNull();
    });

    it('com preços: custo, % do orçamento, projeção linear e média por usuário ativo', async () => {
      env.AI_PRICES_JSON = PRICES;
      env.AI_MONTHLY_BUDGET_USD = '10';
      const { admin } = build();
      const [a, b] = [await makeUser(prisma, 'A'), await makeUser(prisma, 'B')];
      // US$ 3 do A e US$ 1,5 do B até o dia 11 (10 dias de 30)
      await use(a.id, 'PHOTO', new Date('2026-11-05T15:00:00Z'), { inputTokens: 1_000_000, outputTokens: 0 });
      await use(b.id, 'TEXT', new Date('2026-11-05T15:00:00Z'), { inputTokens: 0, outputTokens: 100_000 });
      const now = new Date('2026-11-11T03:00:00Z');
      const r = await admin.usage(30, now);
      expect(r.month.estimatedCostUsd).toBeCloseTo(4.5, 4);
      expect(r.month.percentOfBudget).toBeCloseTo(45, 1);
      expect(r.month.projectedCostUsd).toBeCloseTo(13.5, 3); // 4,5 x 30/10
      expect(r.month.budgetActive).toBe(true);
      expect(r.perActiveUser).toMatchObject({ activeUsers: 2, averageCallsMonth: 1 });
      expect(r.perActiveUser.averageCostUsd).toBeCloseTo(2.25, 4);
      expect(r.byUser.map((x) => x.userId)).toEqual([a.id, b.id]); // ordenado por custo
      expect(r.byFeature.find((f) => f.feature === 'PHOTO')).toMatchObject({ calls: 1, failed: 0 });
    });

    it('lista por usuário: e-mail mascarado, fator e selo de admin; falhas aparecem só como contagem', async () => {
      env.AI_PRICES_JSON = PRICES;
      const root = await makeUser(prisma, 'Root');
      env.ADMIN_EMAILS = root.email;
      const { admin } = build();
      await use(root.id, 'TEXT', new Date('2026-11-10T15:00:00Z'));
      await use(root.id, 'TEXT', new Date('2026-11-10T15:00:00Z'), { status: 'FAILED' });
      const r = await admin.usage(30, NOW);
      expect(r.byUser[0].label).toMatch(/^t\*\*\*@teste\.local$/);
      expect(JSON.stringify(r)).not.toContain(root.email);
      expect(r.byUser[0]).toMatchObject({ unlimited: true, aiLimitFactor: 1, calls: 1 });
      expect(r.byFeature.find((f) => f.feature === 'TEXT')?.failed).toBe(1);
    });

    it('altera o fator de limite e dá 404 para usuário inexistente', async () => {
      const { admin } = build();
      const u = await makeUser(prisma);
      await admin.setLimitFactor(u.id, 2);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).aiLimitFactor).toBe(2);
      await expect(admin.setLimitFactor('00000000-0000-4000-8000-000000000000', 1)).rejects.toBeDefined();
    });
  });

  // ---------------------------------------------------------------- conta
  it('exclusão de conta: AiUsage fica com userId null (anônimo) e continua somando no custo', async () => {
    env.AI_PRICES_JSON = PRICES;
    const { admin } = build();
    const u = await makeUser(prisma);
    u.email = u.email;
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: null } });
    await use(u.id, 'PHOTO', new Date('2026-11-10T15:00:00Z'), { inputTokens: 1_000_000, outputTokens: 0 });
    await new AccountService(prisma).deleteAccount(u.id, { confirmation: 'EXCLUIR' } as any);
    const row = await prisma.aiUsage.findFirstOrThrow();
    expect(row.userId).toBeNull();
    const r = await admin.usage(30, NOW);
    expect(r.month.calls).toBe(1);
    expect(r.month.estimatedCostUsd).toBeCloseTo(3, 4);
    expect(r.byUser).toHaveLength(0); // anônimo: sem linha por usuário
    expect(r.perActiveUser.activeUsers).toBe(0);
  });
});

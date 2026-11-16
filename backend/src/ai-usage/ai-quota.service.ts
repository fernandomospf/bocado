import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiFeature, Prisma } from '@prisma/client';
import { BetaConfig } from '../beta/beta.config';
import { PrismaService } from '../prisma/prisma.service';
import { AI_FEATURES, AiUsageConfig } from './ai-usage.config';
import { dayBounds, effectiveLimit, estimateCostUsd, monthBounds } from './quota.math';

export type QuotaCode = 'AI_QUOTA_DAILY' | 'AI_QUOTA_MONTHLY' | 'AI_BUDGET_PAUSED' | 'AI_BLOCKED';

export interface QuotaBody {
  code: QuotaCode;
  message: string;
  feature: AiFeature;
  limit: number | null;
  used: number | null;
  resetsAt: string | null;
}

/** Resposta 429 de cota. O app usa `code` e `message` (já em português) no lugar do erro genérico. */
export class AiQuotaExceededError extends HttpException {
  constructor(readonly body: QuotaBody) {
    super(body, HttpStatus.TOO_MANY_REQUESTS);
  }
}

const GLOBAL_LOCK = 724_002;
const PENDING_TTL_MS = 10 * 60_000;
const RETENTION_MONTHS = 13;
const CLEANUP_EVERY_MS = 24 * 3_600_000;

const FEATURE_TEXT: Record<AiFeature, { one: string; many: string; alt: string }> = {
  PHOTO: { one: 'a análise por foto', many: 'análises por foto', alt: 'dá para buscar o alimento, ler o código de barras ou digitar' },
  TEXT: { one: 'a análise por descrição', many: 'análises por descrição', alt: 'dá para buscar o alimento, ler o código de barras ou digitar' },
  LABEL: { one: 'a leitura de rótulo', many: 'leituras de rótulo', alt: 'dá para buscar o produto ou digitar os valores' },
  SUGGEST: { one: 'a sugestão com IA', many: 'sugestões com IA', alt: 'dá para registrar por busca, repetir ontem ou usar as suas receitas' },
};

const PAUSED_MESSAGE =
  'A análise por IA está em pausa por enquanto no beta. Você continua podendo registrar por busca, código de barras ou manual.';
const BLOCKED_MESSAGE =
  'A análise por IA não está disponível para a sua conta no momento. Você continua podendo registrar por busca, código de barras ou manual.';

const hourBr = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
const dateBr = (d: Date, tz: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: tz, day: '2-digit', month: '2-digit' }).format(d);

export interface UsagePart {
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export interface QuotaSummary {
  features: Record<AiFeature, { used: number; limit: number; resetsAt: string }>;
  monthly: { used: number; limit: number; resetsAt: string };
  paused: boolean;
}

/**
 * Cota de IA: reserva antes da chamada, fecha depois. Só OK e PENDING (recente) contam nos limites; FAILED não.
 * A reserva roda numa transação com advisory lock (por usuário e, com orçamento, global), então chamadas simultâneas
 * não furam o limite.
 */
@Injectable()
export class AiQuotaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiQuotaService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AiUsageConfig,
    private readonly beta: BetaConfig,
  ) {}

  onModuleInit() {
    void this.sweep();
    this.timer = setInterval(() => void this.sweep(), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Reservas PENDING com mais de 10 min viram FAILED (processo caiu no meio); registros com mais de 13 meses saem. */
  async sweep(now = new Date()) {
    try {
      const stale = await this.prisma.aiUsage.updateMany({
        where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } },
        data: { status: 'FAILED', settledAt: now },
      });
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
      const old = await this.prisma.aiUsage.deleteMany({ where: { createdAt: { lt: cutoff } } });
      if (stale.count || old.count) this.logger.log(`AiUsage: ${stale.count} reserva(s) vencida(s) → FAILED, ${old.count} registro(s) antigo(s) removido(s)`);
      return { stale: stale.count, removed: old.count };
    } catch (err) {
      this.logger.warn(`Falha na limpeza do AiUsage: ${(err as Error).message}`);
      return { stale: 0, removed: 0 };
    }
  }

  private counted(now: Date): Prisma.AiUsageWhereInput {
    return { OR: [{ status: 'OK' }, { status: 'PENDING', createdAt: { gt: new Date(now.getTime() - PENDING_TTL_MS) } }] };
  }

  private isAdmin(email: string) {
    return this.beta.adminEmails.has(email.trim().toLowerCase());
  }

  /** Custo estimado do mês (OK + PENDING) dos modelos com preço. PENDING usa a média por chamada OK do mesmo modelo. */
  async monthSpendUsd(db: Prisma.TransactionClient | PrismaService, now: Date): Promise<number> {
    const { start, end } = monthBounds(now, this.cfg.timeZone);
    const rows = await db.aiUsage.groupBy({
      by: ['model', 'status'],
      where: { createdAt: { gte: start, lt: end }, ...this.counted(now) },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });
    let total = 0;
    const perModel = new Map<string, { okCost: number; okCalls: number; pending: number }>();
    for (const r of rows) {
      const e = perModel.get(r.model) ?? { okCost: 0, okCalls: 0, pending: 0 };
      if (r.status === 'OK') {
        e.okCost += estimateCostUsd(r._sum.inputTokens ?? 0, r._sum.outputTokens ?? 0, this.cfg.priceFor(r.model)) ?? 0;
        e.okCalls += r._count._all;
      } else e.pending += r._count._all;
      perModel.set(r.model, e);
    }
    for (const e of perModel.values()) total += e.okCost + (e.okCalls > 0 ? e.pending * (e.okCost / e.okCalls) : 0);
    return total;
  }

  private budgetActiveFor(model: string) {
    return this.cfg.budgetUsd !== null && this.cfg.priceFor(model) !== undefined;
  }

  private exceeded(code: QuotaCode, feature: AiFeature, limit: number | null, used: number | null, resetsAt: Date | null): AiQuotaExceededError {
    const t = this.cfg.timeZone;
    const f = FEATURE_TEXT[feature];
    let message: string;
    if (code === 'AI_QUOTA_DAILY') {
      const subject = limit === 1 ? `a única ${f.one.replace(/^a /, '')}` : `as ${limit} ${f.many}`;
      message = `Você usou ${subject} de hoje. Elas voltam amanhã às ${hourBr(resetsAt ?? new Date(), t)}. Enquanto isso, ${f.alt}.`;
    } else if (code === 'AI_QUOTA_MONTHLY') {
      message = `Você chegou ao limite de ${limit} usos de IA deste mês. Eles voltam em ${dateBr(resetsAt ?? new Date(), t)}. Enquanto isso, você continua podendo registrar por busca, código de barras ou manual.`;
    } else if (code === 'AI_BUDGET_PAUSED') message = PAUSED_MESSAGE;
    else message = BLOCKED_MESSAGE;
    return new AiQuotaExceededError({ code, message, feature, limit, used, resetsAt: resetsAt ? resetsAt.toISOString() : null });
  }

  /**
   * Reserva uma chamada (PENDING) depois de checar, nesta ordem: orçamento global do mês, limite mensal do usuário e
   * limite diário da funcionalidade. Admins ficam isentos dos limites por usuário, mas contam no orçamento.
   */
  async reserve(userId: string, feature: AiFeature, model: string, now = new Date()): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const budgetOn = this.budgetActiveFor(model);
      if (budgetOn) await tx.$executeRaw`SELECT pg_advisory_xact_lock(${GLOBAL_LOCK})`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

      const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true, aiLimitFactor: true } });
      if (!user) throw new HttpException('Sessão inválida', HttpStatus.UNAUTHORIZED);
      const tz = this.cfg.timeZone;
      const day = dayBounds(now, tz);
      const month = monthBounds(now, tz);

      if (budgetOn) {
        const spent = await this.monthSpendUsd(tx, now);
        if (spent >= (this.cfg.budgetUsd as number)) throw this.exceeded('AI_BUDGET_PAUSED', feature, null, null, month.end);
      }

      if (!this.isAdmin(user.email)) {
        const factor = user.aiLimitFactor;
        if (factor <= 0) throw this.exceeded('AI_BLOCKED', feature, 0, 0, null);

        const monthlyLimit = effectiveLimit(this.cfg.monthlyLimit, factor);
        const usedMonth = await tx.aiUsage.count({ where: { userId, createdAt: { gte: month.start, lt: month.end }, ...this.counted(now) } });
        if (usedMonth >= monthlyLimit) throw this.exceeded('AI_QUOTA_MONTHLY', feature, monthlyLimit, usedMonth, month.end);

        const dailyLimit = effectiveLimit(this.cfg.dailyLimit(feature), factor);
        const usedDay = await tx.aiUsage.count({ where: { userId, feature, createdAt: { gte: day.start, lt: day.end }, ...this.counted(now) } });
        if (usedDay >= dailyLimit) throw this.exceeded('AI_QUOTA_DAILY', feature, dailyLimit, usedDay, day.end);
      }

      const row = await tx.aiUsage.create({ data: { userId, feature, model }, select: { id: true } });
      return row.id;
    });
  }

  /** Fecha a reserva como OK com os tokens do SDK. Sem `usage`, grava 0 e avisa no log (não bloqueia a pessoa). */
  async settle(reservationId: string, usage?: UsagePart | null) {
    const input = usage?.input_tokens;
    const output = usage?.output_tokens;
    if (typeof input !== 'number' || typeof output !== 'number') {
      this.logger.warn('O SDK não devolveu usage (input_tokens/output_tokens): gravando 0 tokens nesta chamada');
    }
    await this.prisma.aiUsage.updateMany({
      where: { id: reservationId, status: 'PENDING' },
      data: {
        status: 'OK',
        inputTokens: Math.max(0, Math.round(typeof input === 'number' ? input : 0)),
        outputTokens: Math.max(0, Math.round(typeof output === 'number' ? output : 0)),
        settledAt: new Date(),
      },
    });
  }

  /** Chamada que falhou: FAILED, e falhas não consomem cota. */
  async fail(reservationId: string) {
    await this.prisma.aiUsage.updateMany({
      where: { id: reservationId, status: 'PENDING' },
      data: { status: 'FAILED', settledAt: new Date() },
    });
  }

  /** O orçamento global do mês já acabou (para o app avisar sem gastar uma reserva)? */
  async isPaused(now = new Date()): Promise<boolean> {
    const budget = this.cfg.budgetUsd;
    if (budget === null || !this.cfg.configuredModels.some((m) => this.cfg.priceFor(m))) return false;
    return (await this.monthSpendUsd(this.prisma, now)) >= budget;
  }

  /** Só dados do próprio usuário: usado e limite de cada funcionalidade e do mês. */
  async quota(userId: string, now = new Date()): Promise<QuotaSummary> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { aiLimitFactor: true } });
    const factor = user?.aiLimitFactor ?? 1;
    const tz = this.cfg.timeZone;
    const day = dayBounds(now, tz);
    const month = monthBounds(now, tz);
    const counted = this.counted(now);
    const [byFeature, usedMonth, paused] = await Promise.all([
      this.prisma.aiUsage.groupBy({ by: ['feature'], where: { userId, createdAt: { gte: day.start, lt: day.end }, ...counted }, _count: { _all: true } }),
      this.prisma.aiUsage.count({ where: { userId, createdAt: { gte: month.start, lt: month.end }, ...counted } }),
      this.isPaused(now),
    ]);
    const used = new Map(byFeature.map((r) => [r.feature, r._count._all]));
    const features = Object.fromEntries(
      AI_FEATURES.map((f) => [f, { used: used.get(f) ?? 0, limit: effectiveLimit(this.cfg.dailyLimit(f), factor), resetsAt: day.end.toISOString() }]),
    ) as QuotaSummary['features'];
    return { features, monthly: { used: usedMonth, limit: effectiveLimit(this.cfg.monthlyLimit, factor), resetsAt: month.end.toISOString() }, paused };
  }

  /** Quantas chamadas da funcionalidade ainda cabem hoje (0 se pausada ou bloqueada). Admin: pelo menos 1. */
  async remaining(userId: string, feature: AiFeature, now = new Date()): Promise<number> {
    const q = await this.quota(userId, now);
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const admin = !!user && this.isAdmin(user.email);
    if (q.paused) return 0;
    const f = q.features[feature];
    const left = Math.min(f.limit - f.used, q.monthly.limit - q.monthly.used);
    return admin ? Math.max(1, left) : Math.max(0, left);
  }
}

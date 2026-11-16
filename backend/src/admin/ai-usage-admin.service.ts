import { Injectable, NotFoundException } from '@nestjs/common';
import { AiFeature } from '@prisma/client';
import { BetaConfig } from '../beta/beta.config';
import { AiQuotaService } from '../ai-usage/ai-quota.service';
import { AI_FEATURES, AiUsageConfig } from '../ai-usage/ai-usage.config';
import { estimateCostUsd, maskEmail, monthBounds, projectMonthCost } from '../ai-usage/quota.math';
import { PrismaService } from '../prisma/prisma.service';

const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

interface Row {
  userId: string | null;
  feature: AiFeature;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

/** Painel de uso e custo da IA. Só números agregados: nada de conteúdo e e-mails mascarados. */
@Injectable()
export class AiUsageAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cfg: AiUsageConfig,
    private readonly quota: AiQuotaService,
    private readonly beta: BetaConfig,
  ) {}

  private async rows(from: Date, to: Date): Promise<Row[]> {
    const g = await this.prisma.aiUsage.groupBy({
      by: ['userId', 'feature', 'model'],
      where: { status: 'OK', createdAt: { gte: from, lt: to } },
      _sum: { inputTokens: true, outputTokens: true },
      _count: { _all: true },
    });
    return g.map((r) => ({ userId: r.userId, feature: r.feature, model: r.model, calls: r._count._all, inputTokens: r._sum.inputTokens ?? 0, outputTokens: r._sum.outputTokens ?? 0 }));
  }

  /** Soma o custo das linhas; null se algum modelo usado não tem preço configurado (nada de número inventado). */
  private cost(rows: Pick<Row, 'model' | 'inputTokens' | 'outputTokens'>[]): number | null {
    let total = 0;
    for (const r of rows) {
      const c = estimateCostUsd(r.inputTokens, r.outputTokens, this.cfg.priceFor(r.model));
      if (c === null) return null;
      total += c;
    }
    return total;
  }

  async usage(days = 30, now = new Date()) {
    const { start: monthStart, end: monthEnd } = monthBounds(now, this.cfg.timeZone);
    const since = new Date(now.getTime() - days * 86_400_000);
    const [monthRows, windowRows, failed, hitsText, hitsSuggest] = await Promise.all([
      this.rows(monthStart, monthEnd),
      this.rows(since, new Date(now.getTime() + 1)),
      this.prisma.aiUsage.groupBy({ by: ['feature'], where: { status: 'FAILED', createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.analysisCache.aggregate({ _sum: { hits: true } }),
      this.prisma.suggestionCache.aggregate({ _sum: { hits: true } }),
    ]);

    // Sem linhas, o custo é 0 só se TODOS os modelos configurados têm preço; senão fica "não configurado"
    const allConfiguredPriced = this.cfg.configuredModels.every((m) => this.cfg.priceFor(m));
    const monthCost = monthRows.length ? this.cost(monthRows) : allConfiguredPriced ? 0 : null;
    const budget = this.cfg.budgetUsd;
    const budgetActive = budget !== null && monthCost !== null;
    const month = {
      calls: monthRows.reduce((s, r) => s + r.calls, 0),
      inputTokens: monthRows.reduce((s, r) => s + r.inputTokens, 0),
      outputTokens: monthRows.reduce((s, r) => s + r.outputTokens, 0),
      estimatedCostUsd: monthCost === null ? null : round(monthCost),
      ...(budget !== null ? { budgetUsd: budget } : {}),
      ...(budgetActive ? { percentOfBudget: round((monthCost / (budget as number)) * 100, 1) } : {}),
      ...(monthCost !== null ? { projectedCostUsd: round(projectMonthCost(monthCost, now, monthStart, monthEnd) ?? monthCost) } : {}),
      budgetActive,
      pricesConfigured: this.cfg.configuredModels.every((m) => this.cfg.priceFor(m)) && Object.keys(this.cfg.prices).length > 0,
      models: this.cfg.configuredModels,
    };

    const failedBy = new Map(failed.map((f) => [f.feature, f._count._all]));
    const byFeature = AI_FEATURES.map((feature) => {
      const rs = windowRows.filter((r) => r.feature === feature);
      const c = rs.length ? this.cost(rs) : null;
      return {
        feature,
        model: this.cfg.modelFor(feature),
        calls: rs.reduce((s, r) => s + r.calls, 0),
        failed: failedBy.get(feature) ?? 0,
        inputTokens: rs.reduce((s, r) => s + r.inputTokens, 0),
        outputTokens: rs.reduce((s, r) => s + r.outputTokens, 0),
        estimatedCostUsd: rs.length === 0 ? (this.cfg.priceFor(this.cfg.modelFor(feature)) ? 0 : null) : c === null ? null : round(c),
      };
    });

    // Por usuário (janela de `days`), top 50 por custo (sem preços: por tokens)
    const perUser = new Map<string, Row[]>();
    for (const r of windowRows) if (r.userId) perUser.set(r.userId, [...(perUser.get(r.userId) ?? []), r]);
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...perUser.keys()] } },
      select: { id: true, email: true, aiLimitFactor: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const byUser = [...perUser.entries()]
      .map(([userId, rs]) => {
        const u = byId.get(userId);
        const c = this.cost(rs);
        return {
          userId,
          label: u ? maskEmail(u.email) : 'conta removida',
          calls: rs.reduce((s, r) => s + r.calls, 0),
          tokens: rs.reduce((s, r) => s + r.inputTokens + r.outputTokens, 0),
          estimatedCostUsd: c === null ? null : round(c),
          aiLimitFactor: u?.aiLimitFactor ?? 1,
          unlimited: !!u && this.beta.adminEmails.has(u.email.trim().toLowerCase()),
        };
      })
      .sort((a, b) => (b.estimatedCostUsd ?? -1) - (a.estimatedCostUsd ?? -1) || b.tokens - a.tokens)
      .slice(0, 50);

    // Usuários ativos do mês (>= 1 chamada OK)
    const activeIds = new Set(monthRows.filter((r) => r.userId).map((r) => r.userId as string));
    const activeCalls = monthRows.filter((r) => r.userId).reduce((s, r) => s + r.calls, 0);
    const activeCost = monthRows.filter((r) => r.userId).length ? this.cost(monthRows.filter((r) => r.userId)) : monthCost;
    const perActiveUser = {
      activeUsers: activeIds.size,
      averageCallsMonth: activeIds.size ? round(activeCalls / activeIds.size, 1) : 0,
      averageCostUsd: activeCost === null || activeIds.size === 0 ? null : round(activeCost / activeIds.size),
    };

    return {
      days,
      paused: await this.quota.isPaused(now),
      month,
      byFeature,
      byUser,
      perActiveUser,
      cacheHits: { text: hitsText._sum.hits ?? 0, suggest: hitsSuggest._sum.hits ?? 0 },
    };
  }

  async setLimitFactor(userId: string, factor: number) {
    const { count } = await this.prisma.user.updateMany({ where: { id: userId }, data: { aiLimitFactor: factor } });
    if (count === 0) throw new NotFoundException('Usuário não encontrado');
    return { id: userId, aiLimitFactor: factor };
  }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AnalysisResult } from './analysis.service';

export const ANALYSIS_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Cache das análises por descrição (tabela analysis_cache). Guarda só o hash e o resultado: sem userId e sem o texto.
 * Falha de banco nunca derruba a análise: vira miss na leitura e é ignorada na gravação.
 */
@Injectable()
export class AnalysisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnalysisCacheService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    void this.purgeExpired();
    this.timer = setInterval(() => void this.purgeExpired(), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Resultado válido e dentro da validade, ou null. Um hit conta em hits/lastHitAt. */
  async get(key: string, now: Date = new Date()): Promise<AnalysisResult | null> {
    try {
      const row = await this.prisma.analysisCache.findUnique({ where: { key } });
      if (!row) return null;
      if (now.getTime() - row.createdAt.getTime() >= ANALYSIS_CACHE_TTL_MS) return null;
      const result = row.result as unknown as AnalysisResult;
      if (!result || !Array.isArray(result.items) || result.items.length === 0) return null;
      await this.prisma.analysisCache.update({ where: { key }, data: { hits: { increment: 1 }, lastHitAt: now } });
      return result;
    } catch (err) {
      this.logger.warn(`Cache de análise indisponível (leitura): ${err instanceof Error ? err.message : err}`);
      return null;
    }
  }

  /** Grava só resultados com itens. Substitui uma entrada expirada (reinicia createdAt e hits). */
  async set(key: string, result: AnalysisResult): Promise<void> {
    if (!result.items?.length) return;
    try {
      const data = { result: result as unknown as Prisma.InputJsonValue, hits: 0, createdAt: new Date(), lastHitAt: null };
      await this.prisma.analysisCache.upsert({ where: { key }, create: { key, ...data }, update: data });
    } catch (err) {
      this.logger.warn(`Cache de análise indisponível (gravação): ${err instanceof Error ? err.message : err}`);
    }
  }

  async purgeExpired(now: Date = new Date()): Promise<number> {
    try {
      const { count } = await this.prisma.analysisCache.deleteMany({
        where: { createdAt: { lt: new Date(now.getTime() - ANALYSIS_CACHE_TTL_MS) } },
      });
      if (count > 0) this.logger.log(`analysis cache cleanup: ${count} entrada(s) removida(s)`);
      return count;
    } catch (err) {
      this.logger.warn(`Limpeza do cache de análise falhou: ${err instanceof Error ? err.message : err}`);
      return 0;
    }
  }
}

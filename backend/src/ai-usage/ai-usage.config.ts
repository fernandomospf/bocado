import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiFeature } from '@prisma/client';
import { isValidTimeZone, type ModelPrice, parsePrices, type PriceTable } from './quota.math';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

const DAILY_DEFAULTS: Record<AiFeature, number> = { PHOTO: 8, TEXT: 15, LABEL: 4, SUGGEST: 3 };
const DAILY_ENV: Record<AiFeature, string> = {
  PHOTO: 'AI_DAILY_LIMIT_PHOTO',
  TEXT: 'AI_DAILY_LIMIT_TEXT',
  LABEL: 'AI_DAILY_LIMIT_LABEL',
  SUGGEST: 'AI_DAILY_LIMIT_SUGGEST',
};
const MODEL_ENV: Record<AiFeature, string> = {
  PHOTO: 'ANTHROPIC_MODEL_PHOTO',
  TEXT: 'ANTHROPIC_MODEL_TEXT',
  LABEL: 'ANTHROPIC_MODEL_LABEL',
  SUGGEST: 'ANTHROPIC_MODEL_SUGGEST',
};
export const AI_FEATURES: AiFeature[] = ['PHOTO', 'TEXT', 'LABEL', 'SUGGEST'];

const intOr = (raw: unknown, fallback: number) => {
  const s = String(raw ?? '').trim();
  return /^\d+$/.test(s) ? Number(s) : fallback;
};

/** Variáveis da cota de IA, com padrões seguros. Nenhum preço é inventado: sem AI_PRICES_JSON, o custo é "não configurado". */
@Injectable()
export class AiUsageConfig {
  private readonly logger = new Logger(AiUsageConfig.name);
  readonly prices: PriceTable;

  constructor(private readonly config: ConfigService) {
    const parsed = parsePrices(config.get<string>('AI_PRICES_JSON'));
    this.prices = parsed.prices;
    if (parsed.error) this.logger.warn(`${parsed.error}: custos ficam como "não configurado"`);
    if (this.budgetUsd !== null && Object.keys(this.prices).length === 0) {
      this.logger.warn('AI_MONTHLY_BUDGET_USD definido sem AI_PRICES_JSON: o orçamento em dólares está INATIVO');
    }
  }

  dailyLimit(feature: AiFeature): number {
    return intOr(this.config.get(DAILY_ENV[feature]), DAILY_DEFAULTS[feature]);
  }

  get monthlyLimit(): number {
    return intOr(this.config.get('AI_MONTHLY_LIMIT_TOTAL'), 200);
  }

  /** Fuso do "dia" e do "mês" da cota. */
  get timeZone(): string {
    const tz = String(this.config.get('AI_QUOTA_TZ') ?? '').trim();
    return tz && isValidTimeZone(tz) ? tz : 'America/Sao_Paulo';
  }

  /** Teto global do mês em dólares (null = sem teto). */
  get budgetUsd(): number | null {
    const n = Number(String(this.config.get('AI_MONTHLY_BUDGET_USD') ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  /** Modelo de cada funcionalidade: ANTHROPIC_MODEL_X, depois ANTHROPIC_MODEL, depois o padrão do app. */
  modelFor(feature: AiFeature): string {
    return (
      String(this.config.get(MODEL_ENV[feature]) ?? '').trim() ||
      String(this.config.get('ANTHROPIC_MODEL') ?? '').trim() ||
      DEFAULT_MODEL
    );
  }

  priceFor(model: string): ModelPrice | undefined {
    return this.prices[model];
  }

  /** Todos os modelos em uso pelas funcionalidades. */
  get configuredModels(): string[] {
    return [...new Set(AI_FEATURES.map((f) => this.modelFor(f)))];
  }
}

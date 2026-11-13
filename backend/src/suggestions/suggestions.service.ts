import { createHash } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { FoodSource, GoalType, MealSource, Prisma } from '@prisma/client';
import { SUGGEST_PROMPT_VERSION, SUGGEST_SYSTEM_PROMPT, SUGGEST_TOOL } from '../analysis/analysis.prompt';
import { AnalysisService } from '../analysis/analysis.service';
import { formatDay, parseDay } from '../common/dates';
import { NORMALIZED_NAME_SQL, normalizeName, toPer100 } from '../foods/food-normalize';
import { MealsService } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { coerceAiSuggestions, rescore } from './close-day.ai';
import {
  buildLocalSuggestions,
  Candidate,
  isDayClosed,
  isMealFriendlyTaco,
  Macros,
  mealTarget,
  priorityOf,
  remaining,
  Suggestion,
} from './close-day.math';
import { LogSuggestionDto, SuggestionMeal } from './dto/suggestions.dto';

/**
 * Configuração da IA nesta feature. `isPremiumFeature` marca que ela pode virar recurso pago no futuro
 * (sem planos implementados agora): hoje só existe o limite diário.
 */
export const CLOSE_DAY_AI = {
  feature: 'close-day-ai',
  dailyLimit: 3,
  isPremiumFeature: true,
  cacheTtlMs: 30 * 24 * 60 * 60 * 1000,
} as const;

const HISTORY_DAYS = 60;
const HISTORY_LIMIT = 80;
const BASE_FOODS_LIMIT = 15;

const MEAL_LABEL: Record<SuggestionMeal, string> = { DINNER: 'jantar', SNACK: 'lanche (ceia)' };
const GOAL_LABEL: Record<GoalType, string> = { LOSE: 'perder peso', MAINTAIN: 'manter o peso', GAIN: 'ganhar massa' };

export type SuggestionSource = 'local' | 'ai' | 'none';

export interface CloseDayResponse {
  date: string;
  /** O que falta de verdade para as metas do dia. */
  remaining: Macros | null;
  /** O que UMA refeição deve cobrir (o que falta, limitado a 40% da meta diária). */
  target: Macros | null;
  priority: 'protein' | 'balanced' | null;
  /** Meta batida ou falta pouco: não sugerir comer mais. */
  closed: boolean;
  suggestions: Suggestion[];
  source: SuggestionSource;
  canAskAi: boolean;
  aiRemaining: number;
  isPremiumFeature: boolean;
}

interface HistoryRow {
  norm: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  times: bigint;
}

const round50 = (n: number) => Math.round(n / 50) * 50;
const round5 = (n: number) => Math.round(n / 5) * 5;

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);
  /** A TACO não muda em tempo de execução: carregada uma vez. */
  private tacoCache: { candidates: Candidate[]; genericNames: Map<string, string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
    private readonly analysis: AnalysisService,
    private readonly meals: MealsService,
  ) {}

  /** Sugestões locais (nunca chama a IA). Se nenhuma for boa o suficiente, sinaliza canAskAi. */
  async closeDay(userId: string, date: string): Promise<CloseDayResponse> {
    const ctx = await this.context(userId, date);
    const aiRemaining = await this.aiRemaining(userId);
    const base = { date, aiRemaining, isPremiumFeature: CLOSE_DAY_AI.isPremiumFeature };

    if (!ctx.targets) {
      return { ...base, remaining: null, target: null, priority: null, closed: false, suggestions: [], source: 'none', canAskAi: false };
    }
    if (ctx.closed) {
      return { ...base, remaining: ctx.rem, target: null, priority: null, closed: true, suggestions: [], source: 'none', canAskAi: false };
    }

    const { suggestions } = buildLocalSuggestions(ctx.target, await this.candidates(userId));
    const good = suggestions.some((s) => s.good);
    return {
      ...base,
      remaining: ctx.rem,
      target: ctx.target,
      priority: priorityOf(ctx.rem, ctx.targets),
      closed: false,
      suggestions,
      source: suggestions.length ? 'local' : 'none',
      canAskAi: !good && this.analysis.isConfigured && aiRemaining > 0,
    };
  }

  /**
   * Fallback com o Claude: cache compartilhado por déficit (30 dias) e no máximo 3 chamadas reais
   * por usuário por dia. Acerto de cache não conta no limite.
   */
  async closeDayWithAi(userId: string, date: string, meal: SuggestionMeal): Promise<CloseDayResponse> {
    const ctx = await this.context(userId, date);
    if (!ctx.targets) throw new BadRequestException('Defina suas metas no Perfil para receber sugestões.');
    if (ctx.closed) throw new BadRequestException('Seu dia já está fechado: não há o que completar.');

    const key = cacheKey(ctx.target, meal, ctx.goal);
    const response = (suggestions: Suggestion[], aiRemaining: number): CloseDayResponse => ({
      date,
      remaining: ctx.rem,
      target: ctx.target,
      priority: priorityOf(ctx.rem, ctx.targets!),
      closed: false,
      suggestions: rescore(suggestions, ctx.target),
      source: 'ai',
      canAskAi: false,
      aiRemaining,
      isPremiumFeature: CLOSE_DAY_AI.isPremiumFeature,
    });

    const cached = await this.prisma.suggestionCache.findUnique({ where: { key } });
    if (cached && Date.now() - cached.createdAt.getTime() < CLOSE_DAY_AI.cacheTtlMs) {
      await this.prisma.suggestionCache.update({ where: { key }, data: { hits: { increment: 1 }, lastHitAt: new Date() } });
      this.logger.log('close-day ai: cache hit');
      return response(cached.result as unknown as Suggestion[], await this.aiRemaining(userId));
    }

    const left = await this.reserveAiCall(userId);
    let suggestions: Suggestion[];
    try {
      const raw = await this.analysis.callTool({
        system: SUGGEST_SYSTEM_PROMPT,
        tool: SUGGEST_TOOL,
        content: [{ type: 'text', text: await this.promptText(userId, ctx.target, meal, ctx.goal) }],
        maxTokens: 2500,
        truncatedMessage: 'A sugestão ficou incompleta. Tente de novo.',
      });
      suggestions = coerceAiSuggestions(raw, ctx.target);
    } catch (err) {
      await this.refundAiCall(userId); // falhou antes de termos uma resposta: não conta no limite
      throw err;
    }
    this.logger.log(`close-day ai: cache miss (${suggestions.length} sugestão(ões) válidas)`);

    if (suggestions.length > 0) {
      const data = { result: suggestions as unknown as Prisma.InputJsonValue, createdAt: new Date(), hits: 0, lastHitAt: null };
      await this.prisma.suggestionCache.upsert({ where: { key }, create: { key, ...data }, update: data });
    }
    return response(suggestions, left);
  }

  /** Registra a sugestão escolhida como refeição (source MANUAL: a pessoa conferiu e confirmou). */
  log(userId: string, dto: LogSuggestionDto) {
    return this.meals.create(userId, { date: dto.date, type: dto.type, source: MealSource.MANUAL, items: dto.items });
  }

  // ---------------------------------------------------------------------------

  private async context(userId: string, date: string) {
    assertNotFuture(date);
    const [profile, sums] = await Promise.all([
      this.prisma.profile.findUnique({ where: { userId } }),
      this.prisma.mealItem.aggregate({
        where: { meal: { userId, date: parseDay(date) } },
        _sum: { kcal: true, protein: true, carbs: true, fat: true },
      }),
    ]);
    const totals: Macros = {
      kcal: sums._sum.kcal ?? 0,
      protein: sums._sum.protein ?? 0,
      carbs: sums._sum.carbs ?? 0,
      fat: sums._sum.fat ?? 0,
    };
    const targets: Macros | null = profile
      ? { kcal: profile.kcalTarget, protein: profile.proteinTarget, carbs: profile.carbsTarget, fat: profile.fatTarget }
      : null;
    const rem = targets ? remaining(targets, totals) : { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return {
      targets,
      goal: profile?.goal ?? GoalType.MAINTAIN,
      rem,
      target: targets ? mealTarget(rem, targets) : rem,
      closed: targets ? isDayClosed(targets, totals) : false,
    };
  }

  /** Candidatos na ordem de preferência: histórico (60 dias), receitas, TACO de refeição. */
  async candidates(userId: string): Promise<Candidate[]> {
    const [history, recipes, taco] = await Promise.all([
      this.historyCandidates(userId),
      this.recipes.list(userId),
      this.taco(),
    ]);
    const recipeCandidates: Candidate[] = recipes.map((r) => ({
      key: `r:${r.id}`,
      name: r.name,
      per100: r.per100,
      origin: 'recipe',
      portionGrams: r.portionGrams,
      timesUsed: r.timesUsed,
    }));
    return [...history, ...recipeCandidates, ...taco.candidates];
  }

  private async historyCandidates(userId: string): Promise<Candidate[]> {
    const since = formatDay(new Date(Date.now() - HISTORY_DAYS * 86_400_000));
    const norm = Prisma.raw(NORMALIZED_NAME_SQL('i.name'));
    const rows = await this.prisma.$queryRaw<HistoryRow[]>`
      WITH items AS (
        SELECT i.name, i.grams, i.kcal, i.protein, i.carbs, i.fat, m."createdAt" AS at, ${norm} AS norm
          FROM meal_items i
          JOIN meals m ON m.id = i."mealId"
         WHERE m."userId" = ${userId}::uuid
           AND i.grams > 0
           AND m."date" >= ${since}::date
      ),
      ranked AS (
        SELECT items.*,
               ROW_NUMBER() OVER (PARTITION BY norm ORDER BY at DESC) AS rn,
               COUNT(*) OVER (PARTITION BY norm) AS times
          FROM items
         WHERE norm <> ''
      )
      SELECT norm, name, grams, kcal, protein, carbs, fat, times
        FROM ranked
       WHERE rn = 1
       ORDER BY times DESC, at DESC
       LIMIT ${HISTORY_LIMIT}`;

    return rows.flatMap((r) => {
      const per100 = toPer100(r.grams, r);
      if (!per100 || per100.kcal <= 0 || per100.kcal > 900) return [];
      return [{ key: `h:${r.norm}`, name: r.name, per100, origin: 'history' as const, portionGrams: r.grams, timesUsed: Number(r.times) }];
    });
  }

  private async taco() {
    if (this.tacoCache) return this.tacoCache;
    const foods = await this.prisma.food.findMany({ where: { source: FoodSource.TACO } });
    const candidates: Candidate[] = foods
      .filter((f) => isMealFriendlyTaco(f.name, f.category))
      .map((f) => ({
        key: `t:${f.id}`,
        name: f.name,
        per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
        origin: 'taco' as const,
        category: f.category,
        portionGrams: f.portionGrams,
      }));
    // Vocabulário genérico (primeiro termo dos nomes da TACO): "arroz", "frango", "ovo"…
    const genericNames = new Map<string, string>();
    for (const f of foods) {
      const first = f.name.split(',')[0].trim();
      const norm = normalizeName(first);
      if (norm && !genericNames.has(norm)) genericNames.set(norm, first.toLowerCase());
    }
    this.tacoCache = { candidates, genericNames };
    return this.tacoCache;
  }

  /**
   * Alimentos que a pessoa já come, como base para a IA. Só nomes GENÉRICOS da TACO ("arroz", "frango"):
   * a resposta vai para um cache compartilhado entre usuários, então nada pessoal pode entrar no prompt.
   */
  async baseFoods(userId: string): Promise<string[]> {
    const [history, { genericNames }] = await Promise.all([this.historyCandidates(userId), this.taco()]);
    const out: string[] = [];
    for (const h of history) {
      const words = normalizeName(h.name).split(' ');
      const match = words
        .map((w) => genericNames.get(w) ?? (w.endsWith('s') ? genericNames.get(w.slice(0, -1)) : undefined))
        .find(Boolean);
      if (match && !out.includes(match)) out.push(match);
      if (out.length >= BASE_FOODS_LIMIT) break;
    }
    return out;
  }

  private async promptText(userId: string, rem: Macros, meal: SuggestionMeal, goal: GoalType) {
    const foods = await this.baseFoods(userId);
    return [
      `Esta refeição deve somar cerca de ${rem.kcal} kcal, ${rem.protein} g de proteína, ${rem.carbs} g de carboidratos e ${rem.fat} g de gordura.`,
      `Refeição: ${MEAL_LABEL[meal]}.`,
      `Objetivo da pessoa: ${GOAL_LABEL[goal]}.`,
      foods.length ? `Alimentos que a pessoa costuma comer: ${foods.join(', ')}.` : 'Não há histórico de alimentos.',
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Limite diário de chamadas à IA (dia UTC)
  // ---------------------------------------------------------------------------

  async aiRemaining(userId: string): Promise<number> {
    const row = await this.prisma.aiUsage.findUnique({
      where: { userId_day_feature: { userId, day: todayUtc(), feature: CLOSE_DAY_AI.feature } },
    });
    return Math.max(0, CLOSE_DAY_AI.dailyLimit - (row?.count ?? 0));
  }

  /** Reserva antes de chamar (dois cliques simultâneos não estouram o limite). Devolve quantas restam. */
  private async reserveAiCall(userId: string): Promise<number> {
    const where = { userId_day_feature: { userId, day: todayUtc(), feature: CLOSE_DAY_AI.feature } };
    const row = await this.prisma.aiUsage.upsert({
      where,
      create: { userId, day: todayUtc(), feature: CLOSE_DAY_AI.feature, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (row.count > CLOSE_DAY_AI.dailyLimit) {
      await this.prisma.aiUsage.update({ where, data: { count: { decrement: 1 } } });
      throw new HttpException(
        `Você já usou as ${CLOSE_DAY_AI.dailyLimit} sugestões com IA de hoje. Amanhã tem mais.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return CLOSE_DAY_AI.dailyLimit - row.count;
  }

  private async refundAiCall(userId: string) {
    await this.prisma.aiUsage.updateMany({
      where: { userId, day: todayUtc(), feature: CLOSE_DAY_AI.feature, count: { gt: 0 } },
      data: { count: { decrement: 1 } },
    });
  }
}

/** Mesmo déficit (arredondado a 50 kcal e 5 g) + refeição + objetivo + versão do prompt = mesma resposta. */
export function cacheKey(rem: Macros, meal: SuggestionMeal, goal: GoalType): string {
  const payload = JSON.stringify({
    kcal: round50(rem.kcal),
    protein: round5(rem.protein),
    carbs: round5(rem.carbs),
    fat: round5(rem.fat),
    meal,
    goal,
    v: SUGGEST_PROMPT_VERSION,
  });
  return createHash('sha256').update(payload).digest('hex');
}

function todayUtc(now = new Date()): Date {
  return parseDay(now.toISOString().slice(0, 10));
}

/** Aceita até 1 dia à frente do UTC (o servidor não sabe o fuso do usuário). */
function assertNotFuture(date: string) {
  const day = parseDay(date).getTime();
  if (Number.isNaN(day)) throw new BadRequestException('Data inválida');
  if (day > todayUtc().getTime() + 86_400_000) throw new BadRequestException('A data não pode ser no futuro');
}

import { createHash } from 'node:crypto';
import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { FoodSource, GoalType, MealSource, MealType, Prisma } from '@prisma/client';
import { SUGGEST_PROMPT_VERSION, SUGGEST_SYSTEM_PROMPT, SUGGEST_TOOL } from '../analysis/analysis.prompt';
import { AnalysisService } from '../analysis/analysis.service';
import { formatDay, parseDay } from '../common/dates';
import { formatFoodName } from '../foods/food-names';
import { NORMALIZED_NAME_SQL, normalizeName } from '../foods/food-normalize';
import { FoodResult, FoodsService } from '../foods/foods.service';
import { MealsService } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { coerceAiSuggestions, rescore } from './close-day.ai';
import {
  familyOf,
  Food,
  HistoryMeal,
  isDayClosed,
  kindOf,
  Macros,
  mealGroupKey,
  mealTarget,
  pantrySuggestions,
  parsePantry,
  pickDiverse,
  priorityOf,
  remaining,
  ResolvedTemplate,
  scaleHistoryMeal,
  Suggestion,
  templateSuggestions,
} from './close-day.math';
import { LogSuggestionDto, SuggestionMeal } from './dto/suggestions.dto';
import { MEAL_TEMPLATES, TEMPLATE_FOOD_NAMES } from './meal-templates';

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
const HISTORY_MEALS_SCAN = 200;
const CHIPS_LIMIT = 8;
const BASE_FOODS_LIMIT = 15;
/** Salada genérica quando a despensa não traz verdura. */
const DEFAULT_VEG = ['Alface, crespa, crua', 'Tomate, com semente, cru'];

/**
 * Forma mais comum de cada ingrediente da despensa (termo normalizado, no singular → nome exato da TACO).
 * Sem isso, a busca genérica escolhe "Maionese com ovos" para "ovos" e "Coração de frango" para "frango".
 */
const PANTRY_PREFERRED: Record<string, string> = {
  frango: 'Frango, peito, sem pele, grelhado',
  'peito de frango': 'Frango, peito, sem pele, grelhado',
  'coxa de frango': 'Frango, coxa, sem pele, cozida',
  ovo: 'Ovo, de galinha, inteiro, cozido/10minutos',
  carne: 'Carne, bovina, acém, moído, cozido',
  'carne moida': 'Carne, bovina, acém, moído, cozido',
  bife: 'Carne, bovina, patinho, sem gordura, grelhado',
  patinho: 'Carne, bovina, patinho, sem gordura, grelhado',
  peixe: 'Merluza, filé, assado',
  atum: 'Atum, conserva em óleo',
  sardinha: 'Sardinha, assada',
  arroz: 'Arroz, tipo 1, cozido',
  'arroz integral': 'Arroz, integral, cozido',
  feijao: 'Feijão, carioca, cozido',
  'feijao preto': 'Feijão, preto, cozido',
  batata: 'Batata, inglesa, cozida',
  'batata doce': 'Batata, doce, cozida',
  mandioca: 'Mandioca, cozida',
  aipim: 'Mandioca, cozida',
  macaxeira: 'Mandioca, cozida',
  cuscuz: 'Cuscuz, de milho, cozido com sal',
  pao: 'Pão, trigo, francês',
  'pao frances': 'Pão, trigo, francês',
  'pao integral': 'Pão, trigo, forma, integral',
  'pao de forma': 'Pão, trigo, forma, integral',
  tapioca: 'Tapioca, com manteiga',
  queijo: 'Queijo, minas, frescal',
  iogurte: 'Iogurte, natural',
  aveia: 'Aveia, flocos, crua',
  banana: 'Banana, prata, crua',
  mamao: 'Mamão, Papaia, cru',
  lentilha: 'Lentilha, cozida',
  alface: 'Alface, crespa, crua',
  tomate: 'Tomate, com semente, cru',
  cenoura: 'Cenoura, cozida',
  brocolis: 'Brócolis, cozido',
  abobrinha: 'Abobrinha, italiana, cozida',
  chuchu: 'Chuchu, cozido',
  couve: 'Couve, manteiga, refogada',
  polenta: 'Polenta, pré-cozida',
};

/**
 * Ingredientes sem equivalente honesto na TACO (só existem crus ou como outro prato: macarrão só "cru",
 * "instantâneo" ou "à bolonhesa"). Ficam como não reconhecidos e levam à IA, em vez de trocar por miojo.
 */
const PANTRY_UNAVAILABLE = new Set(['macarrao', 'massa', 'espaguete', 'talharim', 'penne', 'lasanha']);

/** Termo normalizado e no singular ("ovos" → "ovo", "pães" → "pao"). */
function pantryKey(term: string): string {
  return normalizeName(term)
    .split(' ')
    .map((w) => (w === 'paes' ? 'pao' : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w))
    .join(' ');
}

const MEAL_LABEL: Record<SuggestionMeal, string> = { DINNER: 'jantar', SNACK: 'lanche (ceia)' };
const GOAL_LABEL: Record<GoalType, string> = { LOSE: 'perder peso', MAINTAIN: 'manter o peso', GAIN: 'ganhar massa' };

export type SuggestionSource = 'local' | 'ai' | 'none';

export interface PantryInfo {
  recognized: { term: string; name: string }[];
  unknown: string[];
}

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
  /** Ingredientes que a pessoa mais usa (chips do "O que tem em casa?"). */
  pantryChips: string[];
  /** Só nas respostas da despensa: o que foi reconhecido no texto. */
  pantry?: PantryInfo;
}

interface HistoryRow {
  name: string;
  times: bigint;
}

const round50 = (n: number) => Math.round(n / 50) * 50;
const round5 = (n: number) => Math.round(n / 5) * 5;

@Injectable()
export class SuggestionsService {
  private readonly logger = new Logger(SuggestionsService.name);
  /** A TACO não muda em tempo de execução: modelos resolvidos e vocabulário carregados uma vez. */
  private tacoCache: { foods: Map<string, Food>; genericNames: Map<string, string> } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly foods: FoodsService,
    private readonly analysis: AnalysisService,
    private readonly meals: MealsService,
  ) {}

  /** Sugestões locais (nunca chama a IA): histórico do mesmo tipo de refeição → modelos de pratos. */
  async closeDay(userId: string, date: string, meal: SuggestionMeal = 'DINNER'): Promise<CloseDayResponse> {
    const ctx = await this.context(userId, date);
    const base = await this.baseResponse(userId, date, ctx);
    if (!ctx.targets || ctx.closed) return base;

    const [historyMeals, templates, familiar] = await Promise.all([
      this.historyMeals(userId, meal),
      this.resolvedTemplates(meal),
      this.familiarFamilies(userId),
    ]);
    const fromHistory = historyMeals
      .map((m) => scaleHistoryMeal(m, ctx.target))
      .filter((s): s is Suggestion => s !== null);
    const suggestions = pickDiverse(fromHistory, templateSuggestions(templates, ctx.target), ctx.target, { familiar });
    return this.withSuggestions(base, suggestions);
  }

  /**
   * "O que tem em casa?": interpreta o texto sem IA, procura cada termo no histórico e na TACO (mesma busca
   * de /foods/search) e roda o motor só com esses ingredientes. Sem termos reconhecidos ou sem uma opção boa,
   * oferece a IA (que recebe a lista como restrição).
   */
  async closeDayFromPantry(userId: string, date: string, meal: SuggestionMeal, text: string): Promise<CloseDayResponse> {
    const ctx = await this.context(userId, date);
    const base = await this.baseResponse(userId, date, ctx);
    const terms = parsePantry(text);
    if (!ctx.targets || ctx.closed) return { ...base, pantry: { recognized: [], unknown: terms.map((t) => t.term) } };

    const resolved = await Promise.all(terms.map(async (t) => ({ ...t, food: await this.resolvePantryTerm(userId, t.term) })));
    const found = resolved.filter((r): r is typeof r & { food: Food } => r.food !== null);
    const pantry: PantryInfo = {
      recognized: found.map((r) => ({ term: r.term, name: r.food.name })),
      unknown: resolved.filter((r) => !r.food).map((r) => r.term),
    };

    const { foods: taco } = await this.taco();
    const defaultVeg = DEFAULT_VEG.map((n) => taco.get(n)).filter((f): f is Food => !!f);
    const options = pantrySuggestions(
      found.map((r) => ({ food: r.food, quantity: r.quantity })),
      ctx.target,
      defaultVeg,
    );
    const suggestions = pickDiverse([], options, ctx.target, { distinctCarb: false, strict: false });
    return { ...this.withSuggestions(base, suggestions), pantry };
  }

  /**
   * Fallback com o Claude: cache compartilhado por déficit (30 dias) e no máximo 3 chamadas reais
   * por usuário por dia. Acerto de cache não conta no limite. `ingredients` restringe a receita à despensa.
   */
  async closeDayWithAi(
    userId: string,
    date: string,
    meal: SuggestionMeal,
    ingredients: string[] = [],
  ): Promise<CloseDayResponse> {
    const ctx = await this.context(userId, date);
    if (!ctx.targets) throw new BadRequestException('Defina suas metas no Perfil para receber sugestões.');
    if (ctx.closed) throw new BadRequestException('Seu dia já está fechado: não há o que completar.');

    const pantry = normalizeIngredients(ingredients);
    const key = cacheKey(ctx.target, meal, ctx.goal, pantry);
    const base = await this.baseResponse(userId, date, ctx);
    const response = (suggestions: Suggestion[], aiRemaining: number): CloseDayResponse => ({
      ...base,
      suggestions: rescore(suggestions, ctx.target),
      source: 'ai',
      canAskAi: false,
      aiRemaining,
    });

    const cached = await this.prisma.suggestionCache.findUnique({ where: { key } });
    if (cached && Date.now() - cached.createdAt.getTime() < CLOSE_DAY_AI.cacheTtlMs) {
      await this.prisma.suggestionCache.update({ where: { key }, data: { hits: { increment: 1 }, lastHitAt: new Date() } });
      this.logger.log('close-day ai: cache hit');
      return response(cached.result as unknown as Suggestion[], base.aiRemaining);
    }

    const left = await this.reserveAiCall(userId);
    let suggestions: Suggestion[];
    try {
      const raw = await this.analysis.callTool({
        system: SUGGEST_SYSTEM_PROMPT,
        tool: SUGGEST_TOOL,
        content: [{ type: 'text', text: await this.promptText(userId, ctx.target, meal, ctx.goal, pantry) }],
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

  private async baseResponse(
    userId: string,
    date: string,
    ctx: Awaited<ReturnType<SuggestionsService['context']>>,
  ): Promise<CloseDayResponse> {
    const [aiRemaining, pantryChips] = await Promise.all([this.aiRemaining(userId), this.baseFoods(userId, CHIPS_LIMIT)]);
    return {
      date,
      remaining: ctx.targets ? ctx.rem : null,
      target: ctx.targets && !ctx.closed ? ctx.target : null,
      priority: ctx.targets && !ctx.closed ? priorityOf(ctx.rem, ctx.targets) : null,
      closed: ctx.closed,
      suggestions: [],
      source: 'none',
      canAskAi: false,
      aiRemaining,
      isPremiumFeature: CLOSE_DAY_AI.isPremiumFeature,
      pantryChips,
    };
  }

  private withSuggestions(base: CloseDayResponse, suggestions: Suggestion[]): CloseDayResponse {
    const good = suggestions.some((s) => s.good);
    return {
      ...base,
      suggestions,
      source: suggestions.length ? 'local' : 'none',
      canAskAi: !good && this.analysis.isConfigured && base.aiRemaining > 0,
    };
  }

  /**
   * Refeições do mesmo tipo (jantar à noite, lanche na ceia) dos últimos 60 dias, agrupadas como "recentes"
   * (mesmos itens e gramas), da mais frequente para a menos.
   */
  async historyMeals(userId: string, meal: SuggestionMeal): Promise<HistoryMeal[]> {
    const since = formatDay(new Date(Date.now() - HISTORY_DAYS * 86_400_000));
    const meals = await this.prisma.meal.findMany({
      where: { userId, type: meal as MealType, date: { gte: parseDay(since) } },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: HISTORY_MEALS_SCAN,
    });
    const groups = new Map<string, HistoryMeal>();
    for (const m of meals) {
      if (m.items.length === 0) continue;
      const key = mealGroupKey(m.items);
      const group = groups.get(key);
      if (group) group.times += 1;
      else {
        groups.set(key, {
          times: 1,
          // A mais recente do grupo; nomes antigos crus da TACO viram nomes naturais
          items: m.items.map((i) => ({
            name: formatFoodName(i.name),
            grams: i.grams,
            kcal: i.kcal,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
          })),
        });
      }
    }
    return [...groups.values()].sort((a, b) => b.times - a.times);
  }

  /** Famílias de alimento que a pessoa come (desempate dos modelos): "frango", "arroz"… */
  private async familiarFamilies(userId: string): Promise<Set<string>> {
    const rows = await this.historyNames(userId, 40);
    return new Set(rows.map((r) => familyOf(r.name)));
  }

  private async resolvedTemplates(meal: SuggestionMeal): Promise<ResolvedTemplate[]> {
    const { foods } = await this.taco();
    return MEAL_TEMPLATES.filter((t) => t.moment === meal).flatMap((template) => {
      const slots = template.slots.map((s) => ({ ...s, food: foods.get(s.food) }));
      if (slots.some((s) => !s.food)) {
        this.logger.warn(`Modelo "${template.id}" ignorado: alimento ausente na TACO`);
        return [];
      }
      return [{ template, slots: slots.map((s) => ({ food: s.food!, role: s.role, grams: s.grams })) }];
    });
  }

  private async taco() {
    if (this.tacoCache) return this.tacoCache;
    const [templateFoods, allNames] = await Promise.all([
      this.prisma.food.findMany({
        where: {
          source: FoodSource.TACO,
          name: { in: [...TEMPLATE_FOOD_NAMES, ...DEFAULT_VEG, ...Object.values(PANTRY_PREFERRED)] },
        },
      }),
      this.prisma.food.findMany({ where: { source: FoodSource.TACO }, select: { name: true } }),
    ]);
    const foods = new Map<string, Food>(
      templateFoods.map((f) => [
        f.name,
        {
          name: f.displayName || formatFoodName(f.name, f.category),
          per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
          portionGrams: f.portionGrams,
          portionLabel: f.portionLabel,
        },
      ]),
    );
    // Vocabulário genérico (primeiro termo dos nomes da TACO): "arroz", "frango", "ovo"…
    const genericNames = new Map<string, string>();
    for (const f of allNames) {
      const first = f.name.split(',')[0].trim();
      const key = normalizeName(first);
      if (key && !genericNames.has(key)) genericNames.set(key, first.toLowerCase());
    }
    this.tacoCache = { foods, genericNames };
    return this.tacoCache;
  }

  /**
   * Melhor alimento para um termo da despensa:
   * 1) o que a pessoa já registrou com esse nome (mesma busca de /foods/search);
   * 2) a forma mais comum do ingrediente (PANTRY_PREFERRED: "frango" → peito grelhado);
   * 3) a busca geral, preferindo nomes curtos que começam pelo termo e preparos comuns, e recusando itens crus
   *    de carnes e cereais (que não dariam uma porção honesta). Sem nada razoável: não reconhecido.
   */
  async resolvePantryTerm(userId: string, term: string): Promise<Food | null> {
    const key = pantryKey(term);
    const results = (await this.foods.search(userId, term, 10)).filter((r) => r.origin !== 'recipe');
    const fromHistoryFirst = results.find((r) => r.origin === 'history' && pantryKey(r.name).includes(key));
    if (!fromHistoryFirst && PANTRY_UNAVAILABLE.has(key)) return null;

    if (fromHistoryFirst) return toFood(fromHistoryFirst, false);

    const preferred = PANTRY_PREFERRED[key];
    if (preferred) {
      const food = (await this.taco()).foods.get(preferred);
      if (food) return food;
    }

    const candidates = results.filter((r) => {
      const n = normalizeName(r.name);
      const kind = kindOf(r.name);
      const raw = /\b(cru|crua|crus|cruas)\b/.test(n) && kind !== 'veg' && kind !== 'fruit';
      return !raw && n.includes(key.split(' ')[0]);
    });
    if (candidates.length === 0) return null;
    const score = (r: FoodResult) => {
      const n = normalizeName(r.name);
      let sc = -n.split(' ').length * 0.3; // nomes curtos e genéricos primeiro
      if (n.startsWith(key)) sc += 2;
      if (/grelhad|cozid|assad/.test(n)) sc += 1;
      if (/frit|milanesa/.test(n)) sc -= 0.5;
      return sc;
    };
    return toFood([...candidates].sort((a, b) => score(b) - score(a))[0], true);
  }

  private historyNames(userId: string, limit: number): Promise<HistoryRow[]> {
    const since = formatDay(new Date(Date.now() - HISTORY_DAYS * 86_400_000));
    const norm = Prisma.raw(NORMALIZED_NAME_SQL('i.name'));
    return this.prisma.$queryRaw<HistoryRow[]>`
      SELECT MIN(i.name) AS name, COUNT(*) AS times
        FROM meal_items i
        JOIN meals m ON m.id = i."mealId"
       WHERE m."userId" = ${userId}::uuid
         AND m."date" >= ${since}::date
       GROUP BY ${norm}
       ORDER BY times DESC
       LIMIT ${limit}`;
  }

  /**
   * Ingredientes que a pessoa costuma comer, como nomes GENÉRICOS da TACO ("arroz", "frango"): servem de chips
   * na despensa e de base para a IA. Nada pessoal: a resposta da IA vai para um cache compartilhado.
   */
  async baseFoods(userId: string, limit = BASE_FOODS_LIMIT): Promise<string[]> {
    const [history, { genericNames }] = await Promise.all([this.historyNames(userId, 60), this.taco()]);
    const out: string[] = [];
    for (const h of history) {
      const words = normalizeName(h.name).split(' ');
      const match = words
        .map((w) => genericNames.get(w) ?? (w.endsWith('s') ? genericNames.get(w.slice(0, -1)) : undefined))
        .find(Boolean);
      if (match && !out.includes(match)) out.push(match);
      if (out.length >= limit) break;
    }
    return out;
  }

  private async promptText(userId: string, rem: Macros, meal: SuggestionMeal, goal: GoalType, pantry: string[]) {
    const lines = [
      `Esta refeição deve somar cerca de ${rem.kcal} kcal, ${rem.protein} g de proteína, ${rem.carbs} g de carboidratos e ${rem.fat} g de gordura.`,
      `Refeição: ${MEAL_LABEL[meal]}.`,
      `Objetivo da pessoa: ${GOAL_LABEL[goal]}.`,
    ];
    if (pantry.length) {
      lines.push(`Use SÓ estes ingredientes, mais temperos básicos (sal, alho, cebola, ervas, um fio de óleo): ${pantry.join(', ')}.`);
    } else {
      const foods = await this.baseFoods(userId);
      lines.push(foods.length ? `Alimentos que a pessoa costuma comer: ${foods.join(', ')}.` : 'Não há histórico de alimentos.');
    }
    return lines.join('\n');
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

function toFood(r: FoodResult, withPortion: boolean): Food {
  return {
    name: r.name,
    per100: r.per100,
    portionGrams: withPortion && r.portion ? r.portion.grams : null,
    portionLabel: withPortion && r.portion ? r.portion.label : null,
  };
}

/** Ingredientes da despensa normalizados e ordenados (entram no prompt e na chave do cache). */
export function normalizeIngredients(list: string[]): string[] {
  return [...new Set(list.map((i) => normalizeName(i)).filter((i) => i && i.length <= 40))].sort().slice(0, 12);
}

/**
 * Mesmo déficit (arredondado a 50 kcal e 5 g) + refeição + objetivo + ingredientes + versão do prompt = mesma
 * resposta. Usuários diferentes com o mesmo déficit (e a mesma despensa) reaproveitam o resultado.
 */
export function cacheKey(rem: Macros, meal: SuggestionMeal, goal: GoalType, ingredients: string[] = []): string {
  const payload = JSON.stringify({
    kcal: round50(rem.kcal),
    protein: round5(rem.protein),
    carbs: round5(rem.carbs),
    fat: round5(rem.fat),
    meal,
    goal,
    ingredients: normalizeIngredients(ingredients),
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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Food, FoodSource, FoodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { normalizeBarcode } from './barcode';
import { CreateFoodDto } from './dto/food.dto';
import { Macros, NORMALIZED_NAME_SQL, normalizeName, searchTokens, toPer100 } from './food-normalize';
import { OffClient, OffProduct } from './off.client';

/** 'off' = produto do Open Food Facts; 'label' = produto do acervo lido do rótulo por um usuário. */
export type FoodOrigin = 'history' | 'recipe' | 'custom' | 'off' | 'label' | 'taco';

export interface FoodResult {
  id?: string;
  name: string;
  origin: FoodOrigin;
  per100: Macros;
  portion?: { grams: number; label: string };
  timesUsed?: number;
  /** Só receitas: peso da receita inteira (a panela toda). */
  whole?: { grams: number };
  /** Só produtos industrializados. */
  brand?: string | null;
  barcode?: string | null;
}

export type BarcodeLookup =
  | { found: true; origin: 'local' | 'off'; food: FoodResult }
  | { found: false; code: string };

/** Por quanto tempo um código que o OFF não tem deixa de ser consultado de novo. */
export const BARCODE_MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_LIMIT = 20;
/** Com busca preenchida, histórico e alimentos próprios ocupam no máximo isto, para a TACO sempre aparecer. */
const PERSONAL_CAP = 6;
const MIN_TACO_QUERY = 2;
/** Similaridade mínima (pg_trgm, por palavra) para aceitar erros de digitação: "fejao" ~ "feijao" = 0,44. */
const FUZZY_MIN = 0.4;

interface HistoryRow {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  times: bigint;
}

interface TacoRow {
  id: string;
  name: string;
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
  portionGrams: number | null;
  portionLabel: string | null;
}

@Injectable()
export class FoodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recipes: RecipesService,
    private readonly off: OffClient,
  ) {}

  /**
   * Ordem: 1) o que o usuário já registrou, 2) receitas, 3) alimentos próprios, 4) produtos do acervo
   * (Open Food Facts e rótulos), 5) TACO por similaridade.
   * Sem busca, devolve os mais usados e as receitas (estado vazio da tela).
   */
  async search(userId: string, q = '', limit = DEFAULT_LIMIT): Promise<FoodResult[]> {
    const query = normalizeName(q);
    const tokens = searchTokens(q);

    if (!query) {
      const [history, recipes, custom] = await Promise.all([
        this.searchHistory(userId, tokens, limit),
        this.recipes.searchAsFoods(userId, tokens, limit),
        this.searchCustom(userId, tokens, limit),
      ]);
      return [...history, ...recipes, ...custom].slice(0, limit);
    }

    const cap = Math.min(PERSONAL_CAP, limit);
    const shared = query.length >= MIN_TACO_QUERY;
    const [history, recipes, custom, products, taco] = await Promise.all([
      this.searchHistory(userId, tokens, cap),
      this.recipes.searchAsFoods(userId, tokens, cap),
      this.searchCustom(userId, tokens, cap),
      shared ? this.searchProducts(tokens, cap) : Promise.resolve([]),
      shared ? this.searchTaco(query, tokens, limit) : Promise.resolve([]),
    ]);
    return [...history, ...recipes, ...custom, ...products, ...taco].slice(0, limit);
  }

  async create(userId: string, dto: CreateFoodDto): Promise<FoodResult> {
    const food = await this.prisma.food.create({
      data: {
        userId,
        source: FoodSource.CUSTOM,
        name: dto.name,
        searchName: normalizeName(dto.name),
        category: dto.category || null,
        kcal100: dto.kcal100,
        protein100: dto.protein100,
        carbs100: dto.carbs100,
        fat100: dto.fat100,
        portionGrams: dto.portionGrams ?? null,
        portionLabel: dto.portionGrams ? dto.portionLabel || `${dto.portionGrams} g` : null,
      },
    });
    return serializeFood(food, 'custom');
  }

  async remove(userId: string, id: string) {
    // Só alimentos CUSTOM do próprio usuário; TACO e de outros usuários ficam como "não encontrado"
    const { count } = await this.prisma.food.deleteMany({ where: { id, userId, source: FoodSource.CUSTOM } });
    if (count === 0) throw new NotFoundException('Alimento não encontrado');
  }

  /** Itens distintos (por nome normalizado) já registrados, com os valores e a porção do registro mais recente. */
  private async searchHistory(userId: string, tokens: string[], limit: number): Promise<FoodResult[]> {
    const norm = Prisma.raw(NORMALIZED_NAME_SQL('i.name'));
    const match = tokens.length ? Prisma.sql`AND ${matchSql(Prisma.raw('norm'), tokens, false)}` : Prisma.empty;

    const rows = await this.prisma.$queryRaw<HistoryRow[]>`
      WITH items AS (
        SELECT i.name, i.grams, i.kcal, i.protein, i.carbs, i.fat, m."createdAt" AS at, ${norm} AS norm
          FROM meal_items i
          JOIN meals m ON m.id = i."mealId"
         WHERE m."userId" = ${userId}::uuid
           AND i.grams > 0
      ),
      ranked AS (
        SELECT items.*,
               ROW_NUMBER() OVER (PARTITION BY norm ORDER BY at DESC) AS rn,
               COUNT(*) OVER (PARTITION BY norm) AS times
          FROM items
         WHERE norm <> '' ${match}
      )
      SELECT name, grams, kcal, protein, carbs, fat, times
        FROM ranked
       WHERE rn = 1
       ORDER BY times DESC, at DESC
       LIMIT ${limit}`;

    return rows.flatMap((r) => {
      const per100 = toPer100(r.grams, r);
      if (!per100) return [];
      return [
        {
          name: r.name,
          origin: 'history' as const,
          per100,
          portion: { grams: r.grams, label: 'última porção' },
          timesUsed: Number(r.times),
        },
      ];
    });
  }

  /**
   * Consulta por código de barras: 1) acervo local (só ativos), 2) Open Food Facts, que é salvo no acervo
   * para os próximos (a consulta externa acontece no máximo uma vez por produto), 3) não encontrado.
   */
  async lookupBarcode(raw: string): Promise<BarcodeLookup> {
    const code = normalizeBarcode(raw);
    if (!code) throw new BadRequestException('Código de barras inválido. Confira os números.');

    const local = await this.prisma.food.findUnique({ where: { barcode: code } });
    if (local) {
      // Denunciado ou oculto: tratado como não encontrado até a revisão
      return local.status === FoodStatus.ACTIVE
        ? { found: true, origin: 'local', food: serializeFood(local, originOf(local.source)) }
        : { found: false, code };
    }

    const miss = await this.prisma.barcodeMiss.findUnique({ where: { code } });
    if (miss && Date.now() - miss.checkedAt.getTime() < BARCODE_MISS_TTL_MS) return { found: false, code };

    const result = await this.off.lookup(code);
    if (result.status === 'error') return { found: false, code }; // passageiro: sem cache negativo
    if (result.status === 'missing') {
      await this.prisma.barcodeMiss.upsert({
        where: { code },
        create: { code, checkedAt: new Date() },
        update: { checkedAt: new Date() },
      });
      return { found: false, code };
    }

    const food = await this.saveOffProduct(code, result.product);
    return { found: true, origin: 'off', food: serializeFood(food, originOf(food.source)) };
  }

  private async saveOffProduct(code: string, p: OffProduct): Promise<Food> {
    try {
      const food = await this.prisma.food.create({
        data: {
          source: FoodSource.OFF,
          barcode: code,
          name: p.name,
          brand: p.brand,
          searchName: normalizeName([p.name, p.brand].filter(Boolean).join(' ')),
          kcal100: p.per100.kcal,
          protein100: p.per100.protein,
          carbs100: p.per100.carbs,
          fat100: p.per100.fat,
          servingGrams: p.serving?.grams ?? null,
          servingLabel: p.serving?.label ?? null,
        },
      });
      await this.prisma.barcodeMiss.deleteMany({ where: { code } });
      return food;
    } catch (err) {
      // Dois scans simultâneos do mesmo código: o outro já salvou; usa o registro existente
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return this.prisma.food.findUniqueOrThrow({ where: { barcode: code } });
      }
      throw err;
    }
  }

  /** Produtos industrializados do acervo compartilhado (Open Food Facts e rótulos), só os ativos. */
  private async searchProducts(tokens: string[], limit: number): Promise<FoodResult[]> {
    const foods = await this.prisma.food.findMany({
      where: {
        source: { in: [FoodSource.OFF, FoodSource.LABEL] },
        status: FoodStatus.ACTIVE,
        AND: tokens.map((t) => ({ searchName: { contains: t } })),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return foods.map((f) => serializeFood(f, originOf(f.source)));
  }

  private async searchCustom(userId: string, tokens: string[], limit: number): Promise<FoodResult[]> {
    const foods = await this.prisma.food.findMany({
      where: {
        userId,
        source: FoodSource.CUSTOM,
        AND: tokens.map((t) => ({ searchName: { contains: t } })),
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
    return foods.map((f) => serializeFood(f, 'custom'));
  }

  /** Primeiro por palavras exatas; só se nada aparecer, por similaridade (erro de digitação). */
  private async searchTaco(query: string, tokens: string[], limit: number): Promise<FoodResult[]> {
    const exact = await this.queryTaco(query, tokens, limit, false);
    const rows = exact.length ? exact : await this.queryTaco(query, tokens, limit, true);
    return rows.map((r) => serializeFood({ ...r, source: FoodSource.TACO }, 'taco'));
  }

  private queryTaco(query: string, tokens: string[], limit: number, fuzzy: boolean) {
    const col = Prisma.raw('f."searchName"');
    return this.prisma.$queryRaw<TacoRow[]>`
      SELECT f.id, f.name, f.kcal100, f.protein100, f.carbs100, f.fat100, f."portionGrams", f."portionLabel"
        FROM foods f
       WHERE f.source = 'TACO'::"FoodSource"
         AND ${matchSql(col, tokens, fuzzy)}
       ORDER BY
         (${col} LIKE ${`${tokens[0]}%`}) DESC,
         (f."portionGrams" IS NOT NULL) DESC,
         ${similaritySql(col, tokens)} DESC,
         similarity(${col}, ${term(query)}) DESC,
         length(f.name) ASC
       LIMIT ${limit}`;
  }
}

/** Termo da busca já normalizado; unaccent(lower()) garante o mesmo tratamento do lado do banco. */
const term = (t: string) => Prisma.sql`unaccent(lower(${t}))`;

/**
 * Cada palavra da busca precisa aparecer no nome. No modo `fuzzy`, basta ser parecida com alguma palavra dele.
 * Comparar palavra a palavra evita que "frango grelhado" traga "pintado grelhado".
 */
function matchSql(column: Prisma.Sql, tokens: string[], fuzzy: boolean): Prisma.Sql {
  const each = tokens.map((t) =>
    fuzzy
      ? Prisma.sql`(${column} LIKE ${`%${t}%`} OR word_similarity(${term(t)}, ${column}) >= ${FUZZY_MIN})`
      : Prisma.sql`${column} LIKE ${`%${t}%`}`,
  );
  return Prisma.sql`(${Prisma.join(each, ' AND ')})`;
}

/** Soma da similaridade de cada palavra da busca com o nome (desempate entre resultados aproximados). */
function similaritySql(column: Prisma.Sql, tokens: string[]): Prisma.Sql {
  const each = tokens.map((t) => Prisma.sql`word_similarity(${term(t)}, ${column})`);
  return Prisma.sql`(${Prisma.join(each, ' + ')})`;
}

function originOf(source: FoodSource): FoodOrigin {
  if (source === FoodSource.OFF) return 'off';
  if (source === FoodSource.LABEL) return 'label';
  if (source === FoodSource.CUSTOM) return 'custom';
  return 'taco';
}

type SerializableFood = Pick<
  Food,
  'id' | 'name' | 'kcal100' | 'protein100' | 'carbs100' | 'fat100' | 'portionGrams' | 'portionLabel'
> &
  Partial<Pick<Food, 'brand' | 'barcode' | 'servingGrams' | 'servingLabel'>> & { source: FoodSource };

/** Porção sugerida: a medida caseira (TACO e próprios) ou a porção do rótulo (produtos). */
function serializeFood(f: SerializableFood, origin: FoodOrigin): FoodResult {
  const portion = f.portionGrams
    ? { grams: f.portionGrams, label: f.portionLabel || `${f.portionGrams} g` }
    : f.servingGrams
      ? { grams: f.servingGrams, label: f.servingLabel || `${f.servingGrams} g` }
      : undefined;
  const isProduct = f.source === FoodSource.OFF || f.source === FoodSource.LABEL;
  return {
    id: f.id,
    name: f.name,
    origin,
    per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
    ...(portion ? { portion } : {}),
    ...(isProduct ? { brand: f.brand ?? null, barcode: f.barcode ?? null } : {}),
  };
}

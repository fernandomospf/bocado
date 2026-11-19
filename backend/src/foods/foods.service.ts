import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Food, FoodSource, FoodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecipesService } from '../recipes/recipes.service';
import { normalizeBarcode } from './barcode';
import { CreateFoodDto, CreateProductDto } from './dto/food.dto';
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
  /** Produto confirmado por 2 ou mais pessoas diferentes (selo "Verificado"). */
  verified?: boolean;
}

export type BarcodeLookup =
  | { found: true; origin: 'local' | 'off'; food: FoodResult }
  | { found: false; code: string };

/** Denúncias de usuários diferentes para tirar um produto da busca até a revisão. */
export const REPORTS_TO_HIDE = 3;

/** Confirmações de pessoas diferentes (o criador não conta) para o selo "Verificado". */
export const CONFIRMATIONS_TO_VERIFY = 2;
export const isVerified = (verifyCount: number) => verifyCount >= CONFIRMATIONS_TO_VERIFY;

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
  displayName: string | null;
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

  /**
   * Produto lido do rótulo e revisado: entra no acervo compartilhado (source LABEL, sem dono) com o
   * contribuidor registrado. Código já ativo no acervo → 409 com o produto existente. Código de um produto
   * denunciado → a contribuição nova substitui os dados e o reativa (é a correção que a denúncia pedia).
   */
  async createProduct(userId: string, dto: CreateProductDto): Promise<FoodResult> {
    let barcode: string | null = null;
    if (dto.barcode) {
      barcode = normalizeBarcode(dto.barcode);
      if (!barcode) throw new BadRequestException('Código de barras inválido');
    }
    const { kcal, protein, carbs, fat } = dto.per100;
    if (protein + carbs + fat > 100) {
      throw new BadRequestException('Proteína + carboidratos + gorduras passam de 100 g em 100 g de produto.');
    }

    const data = {
      source: FoodSource.LABEL,
      userId: null,
      contributedById: userId,
      name: dto.name,
      brand: dto.brand || null,
      displayName: null,
      searchName: normalizeName([dto.name, dto.brand].filter(Boolean).join(' ')),
      kcal100: kcal,
      protein100: protein,
      carbs100: carbs,
      fat100: fat,
      servingGrams: dto.serving?.grams ?? null,
      servingLabel: dto.serving ? dto.serving.label || `${dto.serving.grams} g` : null,
      status: FoodStatus.ACTIVE,
      reportCount: 0,
      verifyCount: 0,
      mergedIntoId: null,
    };

    if (barcode) {
      const existing = await this.prisma.food.findUnique({ where: { barcode } });
      if (existing?.status === FoodStatus.ACTIVE) throw this.duplicate(existing);
      if (existing) {
        const food = await this.prisma.$transaction(async (tx) => {
          await tx.foodReport.deleteMany({ where: { foodId: existing.id } });
          await tx.foodConfirmation.deleteMany({ where: { foodId: existing.id } });
          return tx.food.update({ where: { id: existing.id }, data });
        });
        return serializeFood(food, 'label');
      }
    }

    try {
      const food = await this.prisma.food.create({ data: { ...data, barcode } });
      if (barcode) await this.prisma.barcodeMiss.deleteMany({ where: { code: barcode } });
      return serializeFood(food, 'label');
    } catch (err) {
      // Outra pessoa salvou o mesmo código no mesmo instante
      if (barcode && err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw this.duplicate(await this.prisma.food.findUniqueOrThrow({ where: { barcode } }));
      }
      throw err;
    }
  }

  private duplicate(existing: Food) {
    return new ConflictException({
      statusCode: 409,
      message: 'Esse produto já está no acervo.',
      product: serializeFood(existing, originOf(existing.source)),
    });
  }

  /**
   * Denúncia de dado errado num produto do acervo (Open Food Facts ou rótulo). Uma por usuário: repetir não
   * conta de novo. Com 3 usuários diferentes, o produto vira REPORTED e sai da busca até a revisão.
   */
  async report(userId: string, rawId: string, reason: string) {
    const foodId = await this.canonicalId(rawId);
    const food = await this.prisma.food.findUnique({ where: { id: foodId } });
    if (!food || (food.source !== FoodSource.OFF && food.source !== FoodSource.LABEL)) {
      throw new NotFoundException('Produto não encontrado');
    }
    const already = await this.prisma.foodReport.findUnique({ where: { foodId_userId: { foodId, userId } } });
    if (already) return { reportCount: food.reportCount, status: food.status, alreadyReported: true };

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.foodReport.create({ data: { foodId, userId, reason } });
        const reportCount = await tx.foodReport.count({ where: { foodId } });
        const status = reportCount >= REPORTS_TO_HIDE ? FoodStatus.REPORTED : food.status;
        // Uma denúncia aceita zera o selo: as confirmações recomeçam do zero depois da correção
        await tx.foodConfirmation.deleteMany({ where: { foodId } });
        await tx.food.update({ where: { id: foodId }, data: { reportCount, status, verifyCount: 0 } });
        return { reportCount, status, alreadyReported: false };
      });
    } catch (err) {
      // Dois envios simultâneos da mesma pessoa: o segundo não conta
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { reportCount: food.reportCount, status: food.status, alreadyReported: true };
      }
      throw err;
    }
  }

  /** Segue o redirecionamento de um duplicado unido (MERGED) até o produto canônico. */
  private async canonicalId(id: string): Promise<string> {
    let current = id;
    for (let hops = 0; hops < 5; hops++) {
      const f = await this.prisma.food.findUnique({ where: { id: current }, select: { status: true, mergedIntoId: true } });
      if (f?.status === FoodStatus.MERGED && f.mergedIntoId) current = f.mergedIntoId;
      else break;
    }
    return current;
  }

  /** Situação do selo para a pessoa: contagem, se já confirmou e se o produto é dela (o criador não confirma o próprio). */
  async verification(userId: string, rawId: string) {
    const foodId = await this.canonicalId(rawId);
    const food = await this.prisma.food.findUnique({ where: { id: foodId } });
    if (!food || (food.source !== FoodSource.OFF && food.source !== FoodSource.LABEL)) throw new NotFoundException('Produto não encontrado');
    const mine = await this.prisma.foodConfirmation.findUnique({ where: { foodId_userId: { foodId, userId } } });
    return {
      id: foodId,
      verifyCount: food.verifyCount,
      verified: isVerified(food.verifyCount),
      confirmedByMe: !!mine,
      ownProduct: food.contributedById === userId,
    };
  }

  /**
   * "Os valores conferem com o rótulo": uma confirmação por pessoa. O criador do produto não conta (nada é gravado).
   * Com 2 ou mais pessoas diferentes o produto ganha o selo "Verificado".
   */
  async confirm(userId: string, rawId: string) {
    const foodId = await this.canonicalId(rawId);
    const food = await this.prisma.food.findUnique({ where: { id: foodId } });
    if (!food || (food.source !== FoodSource.OFF && food.source !== FoodSource.LABEL) || food.status !== FoodStatus.ACTIVE) {
      throw new NotFoundException('Produto não encontrado');
    }
    if (food.contributedById === userId) {
      return { id: foodId, verifyCount: food.verifyCount, verified: isVerified(food.verifyCount), counted: false, ownProduct: true };
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const exists = await tx.foodConfirmation.findUnique({ where: { foodId_userId: { foodId, userId } } });
        if (!exists) await tx.foodConfirmation.create({ data: { foodId, userId } });
        const verifyCount = await tx.foodConfirmation.count({ where: { foodId } });
        await tx.food.update({ where: { id: foodId }, data: { verifyCount } });
        return { id: foodId, verifyCount, verified: isVerified(verifyCount), counted: !exists, ownProduct: false };
      });
    } catch (err) {
      // Dois toques ao mesmo tempo da mesma pessoa: o segundo não conta
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const fresh = await this.prisma.food.findUniqueOrThrow({ where: { id: foodId } });
        return { id: foodId, verifyCount: fresh.verifyCount, verified: isVerified(fresh.verifyCount), counted: false, ownProduct: false };
      }
      throw err;
    }
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

    let local = await this.prisma.food.findUnique({ where: { barcode: code } });
    // Duplicado unido a outro produto: o código leva ao canônico
    if (local?.status === FoodStatus.MERGED && local.mergedIntoId) {
      local = await this.prisma.food.findUnique({ where: { id: await this.canonicalId(local.id) } });
    }
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
      SELECT f.id, f.name, f."displayName", f.kcal100, f.protein100, f.carbs100, f.fat100, f."portionGrams", f."portionLabel"
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
  Partial<Pick<Food, 'brand' | 'barcode' | 'servingGrams' | 'servingLabel' | 'displayName' | 'verifyCount'>> & { source: FoodSource };

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
    // Nome natural na interface ("Peito de frango grelhado" em vez de "Frango, peito, sem pele, grelhado")
    name: f.displayName || f.name,
    origin,
    per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
    ...(portion ? { portion } : {}),
    ...(isProduct ? { brand: f.brand ?? null, barcode: f.barcode ?? null, verified: isVerified(f.verifyCount ?? 0) } : {}),
  };
}

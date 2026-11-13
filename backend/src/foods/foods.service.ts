import { Injectable, NotFoundException } from '@nestjs/common';
import { Food, FoodSource, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFoodDto } from './dto/food.dto';
import { Macros, NORMALIZED_NAME_SQL, normalizeName, searchTokens, toPer100 } from './food-normalize';

export type FoodOrigin = 'history' | 'custom' | 'taco';

export interface FoodResult {
  id?: string;
  name: string;
  origin: FoodOrigin;
  per100: Macros;
  portion?: { grams: number; label: string };
  timesUsed?: number;
}

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
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ordem: 1) o que o usuário já registrou, 2) alimentos próprios, 3) TACO por similaridade.
   * Sem busca, devolve os alimentos mais usados (estado vazio da tela).
   */
  async search(userId: string, q = '', limit = DEFAULT_LIMIT): Promise<FoodResult[]> {
    const query = normalizeName(q);
    const tokens = searchTokens(q);

    if (!query) {
      const [history, custom] = await Promise.all([
        this.searchHistory(userId, tokens, limit),
        this.searchCustom(userId, tokens, limit),
      ]);
      return [...history, ...custom].slice(0, limit);
    }

    const cap = Math.min(PERSONAL_CAP, limit);
    const [history, custom, taco] = await Promise.all([
      this.searchHistory(userId, tokens, cap),
      this.searchCustom(userId, tokens, cap),
      query.length >= MIN_TACO_QUERY ? this.searchTaco(query, tokens, limit) : Promise.resolve([]),
    ]);
    return [...history, ...custom, ...taco].slice(0, limit);
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

function serializeFood(
  f: Pick<Food, 'id' | 'name' | 'kcal100' | 'protein100' | 'carbs100' | 'fat100' | 'portionGrams' | 'portionLabel'> & {
    source: FoodSource;
  },
  origin: FoodOrigin,
): FoodResult {
  return {
    id: f.id,
    name: f.name,
    origin,
    per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
    ...(f.portionGrams ? { portion: { grams: f.portionGrams, label: f.portionLabel || `${f.portionGrams} g` } } : {}),
  };
}

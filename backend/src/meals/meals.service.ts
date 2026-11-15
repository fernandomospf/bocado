import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Meal, MealItem, MealSource } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { CreateMealDto, MoveMealItemDto, UpdateMealItemDto } from './dto/meal.dto';

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const;
const MAX_RANGE_DAYS = 93;

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Último dia aceito como "não futuro". O servidor não sabe o fuso do usuário: aceita até a data de hoje no fuso
 * mais adiantado (UTC+14). A interface limita a hoje no fuso local.
 */
export function latestAllowedDay(now = new Date()): string {
  return formatDay(new Date(now.getTime() + 14 * 3_600_000));
}

function sumItems(items: Pick<MealItem, 'kcal' | 'protein' | 'carbs' | 'fat'>[]): Totals {
  const t = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

@Injectable()
export class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfileService,
  ) {}

  async create(userId: string, dto: CreateMealDto) {
    const meal = await this.prisma.meal.create({
      data: {
        userId,
        date: parseDay(dto.date),
        type: dto.type,
        source: dto.source ?? MealSource.MANUAL,
        note: dto.note || null,
        items: { create: dto.items },
      },
      include: { items: true },
    });
    return this.serializeMeal(meal);
  }

  async remove(userId: string, mealId: string) {
    await this.ownedMeal(userId, mealId);
    await this.prisma.meal.delete({ where: { id: mealId } });
  }

  async updateItem(userId: string, mealId: string, itemId: string, dto: UpdateMealItemDto) {
    await this.ownedItem(userId, mealId, itemId);
    // Mexeu na porção ou nos macros: o valor passa a ser do usuário, não mais a estimativa da IA (só o nome não conta)
    const touchesValues = (['grams', 'kcal', 'protein', 'carbs', 'fat'] as const).some((k) => dto[k] !== undefined);
    const item = await this.prisma.mealItem.update({
      where: { id: itemId },
      data: touchesValues ? { ...dto, estimated: false } : dto,
    });
    return item;
  }

  /**
   * Move o item para a refeição (type, date) do usuário: usa a mais antiga que já existir ou cria uma nova
   * (com a mesma origem). A refeição de origem que ficar vazia é apagada. Tudo numa transação.
   */
  async moveItem(userId: string, mealId: string, itemId: string, dto: MoveMealItemDto) {
    if (dto.date > latestAllowedDay()) throw new BadRequestException('Não dá para mover para um dia futuro');
    await this.ownedItem(userId, mealId, itemId);
    const source = await this.ownedMeal(userId, mealId);
    const fromDate = formatDay(source.date);

    if (source.type === dto.type && fromDate === dto.date) {
      return { fromDate, toDate: dto.date, mealId: source.id };
    }

    return this.prisma.$transaction(async (tx) => {
      const date = parseDay(dto.date);
      const target =
        (await tx.meal.findFirst({
          where: { userId, type: dto.type, date, id: { not: source.id } },
          orderBy: { createdAt: 'asc' },
        })) ??
        (await tx.meal.create({ data: { userId, type: dto.type, date, source: source.source } }));

      await tx.mealItem.update({ where: { id: itemId }, data: { mealId: target.id } });
      const left = await tx.mealItem.count({ where: { mealId: source.id } });
      if (left === 0) await tx.meal.delete({ where: { id: source.id } });

      return { fromDate, toDate: dto.date, mealId: target.id };
    });
  }

  async removeItem(userId: string, mealId: string, itemId: string) {
    await this.ownedItem(userId, mealId, itemId);
    // Remover o último item remove a refeição inteira
    await this.prisma.$transaction(async (tx) => {
      await tx.mealItem.delete({ where: { id: itemId } });
      const left = await tx.mealItem.count({ where: { mealId } });
      if (left === 0) await tx.meal.delete({ where: { id: mealId } });
    });
  }

  async day(userId: string, date: string) {
    const [meals, targets] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId, date: parseDay(date) },
        include: { items: { orderBy: { name: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.profiles.targetsFor(userId),
    ]);
    const sorted = [...meals].sort(
      (a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type),
    );
    return {
      date,
      targets,
      totals: sumItems(meals.flatMap((m) => m.items)),
      meals: sorted.map((m) => this.serializeMeal(m)),
    };
  }

  async range(userId: string, from: string, to: string) {
    const start = parseDay(from);
    const end = parseDay(to);
    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (Number.isNaN(days) || days < 0) throw new BadRequestException('Intervalo inválido');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);

    const rows = await this.prisma.$queryRaw<
      { date: string; kcal: number; protein: number; carbs: number; fat: number; meals: bigint }[]
    >`
      SELECT m."date"::text AS date,
             COALESCE(SUM(i.kcal), 0)::float8    AS kcal,
             COALESCE(SUM(i.protein), 0)::float8 AS protein,
             COALESCE(SUM(i.carbs), 0)::float8   AS carbs,
             COALESCE(SUM(i.fat), 0)::float8     AS fat,
             COUNT(DISTINCT m.id)                AS meals
        FROM meals m
        JOIN meal_items i ON i."mealId" = m.id
       WHERE m."userId" = ${userId}::uuid
         AND m."date" BETWEEN ${from}::date AND ${to}::date
       GROUP BY m."date"
       ORDER BY m."date" ASC`;

    return {
      from,
      to,
      targets: await this.profiles.targetsFor(userId),
      days: rows.map((r) => ({
        date: r.date,
        meals: Number(r.meals),
        totals: {
          kcal: Math.round(r.kcal),
          protein: round1(r.protein),
          carbs: round1(r.carbs),
          fat: round1(r.fat),
        },
      })),
    };
  }

  private serializeMeal(meal: Meal & { items: MealItem[] }) {
    return {
      id: meal.id,
      date: formatDay(meal.date),
      type: meal.type,
      source: meal.source,
      note: meal.note,
      createdAt: meal.createdAt,
      totals: sumItems(meal.items),
      items: meal.items.map(({ mealId: _mealId, ...item }) => item),
    };
  }

  private async ownedMeal(userId: string, mealId: string) {
    const meal = await this.prisma.meal.findFirst({ where: { id: mealId, userId } });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    return meal;
  }

  private async ownedItem(userId: string, mealId: string, itemId: string) {
    const item = await this.prisma.mealItem.findFirst({
      where: { id: itemId, mealId, meal: { userId } },
    });
    if (!item) throw new NotFoundException('Alimento não encontrado');
    return item;
  }
}

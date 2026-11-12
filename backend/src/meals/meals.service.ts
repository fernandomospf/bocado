import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Meal, MealItem, MealSource } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { CreateMealDto, UpdateMealItemDto } from './dto/meal.dto';

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const;
const MAX_RANGE_DAYS = 93;

const round1 = (n: number) => Math.round(n * 10) / 10;

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
    const item = await this.prisma.mealItem.update({ where: { id: itemId }, data: dto });
    return item;
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

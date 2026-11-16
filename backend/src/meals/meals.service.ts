import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Meal, MealItem, MealSource, MealType, Prisma } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { CreateMealDto, MealSnapshotDto, MoveMealItemDto, RepeatMealDto, UpdateMealItemDto } from './dto/meal.dto';
import { summarizeDayWorkouts } from '../workouts/workout.math';
import { groupRecentMeals } from './recent';

export interface Totals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const;
const MAX_RANGE_DAYS = 93;
const RECENT_DAYS = 30;
/** Quantas refeições olhar para trás ao montar os recentes (o grupo é calculado em memória). */
const RECENT_SCAN = 400;
/** Por quanto tempo uma exclusão pode ser desfeita. */
export const RESTORE_WINDOW_MS = 10 * 60_000;
/** Tolerância para relógios adiantados (deletedAt vem do servidor, mas passa pelo app). */
const CLOCK_SKEW_MS = 60_000;

export interface MealSnapshot {
  meal: { id: string; date: string; type: Meal['type']; source: MealSource; note: string | null; createdAt: string };
  items: Omit<MealItem, 'mealId'>[];
  mealDeleted: boolean;
  deletedAt: string;
}

function snapshotOf(meal: Meal, items: MealItem[], mealDeleted: boolean): MealSnapshot {
  return {
    meal: {
      id: meal.id,
      date: formatDay(meal.date),
      type: meal.type,
      source: meal.source,
      note: meal.note,
      createdAt: meal.createdAt.toISOString(),
    },
    items: items.map(({ mealId: _mealId, ...item }) => item),
    mealDeleted,
    deletedAt: new Date().toISOString(),
  };
}

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

  /** Mantém só os recipeId de receitas que o usuário pode ver (o resto vira item avulso, sem erro). */
  async keepVisibleRecipeIds<T extends { recipeId?: string | null }>(userId: string, items: T[]): Promise<T[]> {
    const ids = [...new Set(items.map((i) => i.recipeId).filter((v): v is string => !!v))];
    if (ids.length === 0) return items;
    const visible = await this.prisma.recipe.findMany({
      where: {
        id: { in: ids },
        // Minhas receitas ou as compartilhadas com a minha casa
        OR: [{ ownerId: userId }, { householdId: { not: null }, household: { members: { some: { userId } } } }],
      },
      select: { id: true },
    });
    const ok = new Set(visible.map((r) => r.id));
    return items.map((i) => (i.recipeId && !ok.has(i.recipeId) ? { ...i, recipeId: undefined } : i));
  }

  async create(userId: string, dto: CreateMealDto) {
    const items = await this.keepVisibleRecipeIds(userId, dto.items);
    const meal = await this.prisma.meal.create({
      data: {
        userId,
        date: parseDay(dto.date),
        type: dto.type,
        source: dto.source ?? MealSource.MANUAL,
        note: dto.note || null,
        items: { create: items },
      },
      include: { items: true },
    });
    return this.serializeMeal(meal);
  }

  /**
   * Refeições distintas dos últimos 30 dias (mesmo conjunto de alimentos e gramas = uma só), com a frequência.
   * Com `type`, as desse tipo vêm primeiro e as demais completam a lista.
   */
  async recent(userId: string, type?: MealType, limit = 8) {
    const since = formatDay(new Date(Date.now() - RECENT_DAYS * 86_400_000));
    const meals = await this.prisma.meal.findMany({
      where: { userId, date: { gte: parseDay(since) } },
      include: { items: { orderBy: { name: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: RECENT_SCAN,
    });
    return groupRecentMeals(
      meals.map((m) => ({
        id: m.id,
        type: m.type,
        date: m.date,
        createdAt: m.createdAt,
        items: m.items.map(({ name, grams, kcal, protein, carbs, fat, estimated }) => ({
          name,
          grams,
          kcal,
          protein,
          carbs,
          fat,
          estimated,
        })),
      })),
      type,
      limit,
    );
  }

  /** Duplica a refeição do usuário na data informada (itens novos, mesma origem e mesmo `estimated`). */
  async repeat(userId: string, mealId: string, dto: RepeatMealDto) {
    if (dto.date > latestAllowedDay()) throw new BadRequestException('Não dá para registrar em um dia futuro');
    const source = await this.prisma.meal.findFirst({ where: { id: mealId, userId }, include: { items: true } });
    if (!source) throw new NotFoundException('Refeição não encontrada');
    if (source.items.length === 0) throw new BadRequestException('Essa refeição não tem alimentos');

    const meal = await this.prisma.meal.create({
      data: {
        userId,
        date: parseDay(dto.date),
        type: dto.type ?? source.type,
        source: source.source,
        items: {
          create: source.items.map(({ name, grams, kcal, protein, carbs, fat, estimated, recipeId }) => ({
            name,
            grams,
            kcal,
            protein,
            carbs,
            fat,
            estimated,
            recipeId,
          })),
        },
      },
      include: { items: true },
    });
    return this.serializeMeal(meal);
  }

  async remove(userId: string, mealId: string): Promise<MealSnapshot> {
    const meal = await this.prisma.meal.findFirst({ where: { id: mealId, userId }, include: { items: true } });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    await this.prisma.meal.delete({ where: { id: mealId } });
    return snapshotOf(meal, meal.items, true);
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

  async removeItem(userId: string, mealId: string, itemId: string): Promise<MealSnapshot> {
    const item = await this.prisma.mealItem.findFirst({
      where: { id: itemId, mealId, meal: { userId } },
      include: { meal: true },
    });
    if (!item) throw new NotFoundException('Alimento não encontrado');
    const { meal, ...row } = item;
    // Remover o último item remove a refeição inteira
    const mealDeleted = await this.prisma.$transaction(async (tx) => {
      await tx.mealItem.delete({ where: { id: itemId } });
      const left = await tx.mealItem.count({ where: { mealId } });
      if (left === 0) await tx.meal.delete({ where: { id: mealId } });
      return left === 0;
    });
    return snapshotOf(meal, [row], mealDeleted);
  }

  /**
   * Desfaz uma exclusão. Com mealDeleted, recria a refeição com o MESMO id; senão, devolve os itens à refeição
   * existente (do usuário). Os itens voltam com os mesmos ids. O dono vem sempre da sessão, nunca do snapshot.
   */
  async restore(userId: string, s: MealSnapshotDto) {
    const age = Date.now() - Date.parse(s.deletedAt);
    if (!Number.isFinite(age) || age < -CLOCK_SKEW_MS) throw new BadRequestException('Exclusão inválida');
    if (age > RESTORE_WINDOW_MS) throw new GoneException('Passou o tempo para desfazer esta exclusão');
    if (s.meal.date > latestAllowedDay()) throw new BadRequestException('Data inválida');
    const ids = s.items.map((i) => i.id);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Alimentos repetidos');

    const conflict = () => new ConflictException('Isso já foi restaurado');
    try {
      return await this.prisma.$transaction(async (tx) => {
        let date = s.meal.date;
        if (s.mealDeleted) {
          if (await tx.meal.findUnique({ where: { id: s.meal.id }, select: { id: true } })) throw conflict();
        } else {
          const meal = await tx.meal.findFirst({ where: { id: s.meal.id, userId } });
          if (!meal) throw new NotFoundException('A refeição não existe mais');
          date = formatDay(meal.date);
        }
        if ((await tx.mealItem.count({ where: { id: { in: ids } } })) > 0) throw conflict();

        if (s.mealDeleted) {
          await tx.meal.create({
            data: {
              id: s.meal.id,
              userId,
              date: parseDay(s.meal.date),
              type: s.meal.type,
              source: s.meal.source,
              note: s.meal.note ?? null,
              createdAt: new Date(s.meal.createdAt),
            },
          });
        }
        const restorable = await this.keepVisibleRecipeIds(userId, s.items);
        await tx.mealItem.createMany({
          data: restorable.map((i) => ({
            id: i.id,
            mealId: s.meal.id,
            name: i.name,
            grams: i.grams,
            kcal: i.kcal,
            protein: i.protein,
            carbs: i.carbs,
            fat: i.fat,
            estimated: i.estimated ?? false,
            recipeId: i.recipeId ?? null,
          })),
        });
        return { mealId: s.meal.id, date };
      });
    } catch (err) {
      // Dois "Desfazer" ao mesmo tempo: o segundo bate na chave primária
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict();
      throw err;
    }
  }

  async day(userId: string, date: string) {
    const [meals, targets, workoutRows, prefs] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId, date: parseDay(date) },
        include: { items: { orderBy: { name: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.profiles.targetsFor(userId),
      this.prisma.workout.findMany({ where: { userId, date: parseDay(date) }, orderBy: { createdAt: 'asc' } }),
      this.prisma.profile.findUnique({
        where: { userId },
        select: { weightKg: true, workoutEstimateEnabled: true, workoutAddToGoal: true, hideCalories: true },
      }),
    ]);
    const sorted = [...meals].sort(
      (a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type),
    );
    // Treino é contexto: a estimativa só vem com a preferência ligada, e o bônus só vale para o cálculo DESTE dia.
    // A meta salva no perfil nunca muda; `baseTargetKcal` deixa clara a meta base quando há bônus.
    const w = summarizeDayWorkouts(
      workoutRows,
      prefs?.weightKg ?? 0,
      // Com "esconder calorias" a estimativa e a soma à meta ficam desligadas (a preferência guardada não muda)
      prefs && !prefs.hideCalories ? prefs : { workoutEstimateEnabled: false, workoutAddToGoal: false },
    );
    const bonus = w.goalBonusKcal;
    const sharing = await this.sharingInfo(userId, meals);
    return {
      date,
      targets: targets && bonus ? { ...targets, kcal: targets.kcal + bonus } : targets,
      ...(targets && bonus ? { baseTargetKcal: targets.kcal, goalBonusKcal: bonus } : {}),
      workouts: w.workouts,
      totals: sumItems(meals.flatMap((m) => m.items)),
      meals: sorted.map((m) => ({ ...this.serializeMeal(m), ...sharing.get(m.id) })),
    };
  }

  /**
   * Selos de refeição dividida. Quem recebeu vê `sharedBy` (id e nome) se a pessoa ainda é da mesma casa;
   * senão, só `shared: true`. Quem enviou vê `splitWith` (só nomes de quem ainda é da casa). Nada além disso.
   */
  private async sharingInfo(userId: string, meals: Meal[]) {
    const out = new Map<string, { shared: true; sharedBy?: { id: string; name: string }; splitWith?: { id: string; name: string }[] }>();
    const shared = meals.filter((m) => m.sharedGroupId);
    if (shared.length === 0) return out;

    const mine = await this.prisma.householdMember.findUnique({ where: { userId }, select: { householdId: true } });
    const housemates = new Map<string, string>();
    if (mine) {
      const rows = await this.prisma.householdMember.findMany({
        where: { householdId: mine.householdId },
        select: { userId: true, user: { select: { name: true } } },
      });
      for (const r of rows) housemates.set(r.userId, r.user.name);
    }

    const sentGroups = shared.filter((m) => m.sharedById === userId).map((m) => m.sharedGroupId!);
    const recipients = new Map<string, Set<string>>();
    if (sentGroups.length > 0) {
      const [copies, offers] = await Promise.all([
        this.prisma.meal.findMany({
          where: { sharedGroupId: { in: sentGroups }, userId: { not: userId } },
          select: { sharedGroupId: true, userId: true },
        }),
        this.prisma.sharedMealOffer.findMany({
          where: { groupId: { in: sentGroups }, fromUserId: userId },
          select: { groupId: true, toUserId: true },
        }),
      ]);
      const add = (g: string, u: string) => recipients.set(g, (recipients.get(g) ?? new Set()).add(u));
      copies.forEach((c) => add(c.sharedGroupId!, c.userId));
      offers.forEach((o) => add(o.groupId, o.toUserId));
    }

    for (const m of shared) {
      const info: { shared: true; sharedBy?: { id: string; name: string }; splitWith?: { id: string; name: string }[] } = { shared: true };
      if (m.sharedById === userId) {
        info.splitWith = [...(recipients.get(m.sharedGroupId!) ?? [])]
          .filter((id) => housemates.has(id))
          .map((id) => ({ id, name: housemates.get(id)! }));
      } else if (m.sharedById && housemates.has(m.sharedById)) {
        info.sharedBy = { id: m.sharedById, name: housemates.get(m.sharedById)! };
      }
      out.set(m.id, info);
    }
    return out;
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

  serializeMeal(meal: Meal & { items: MealItem[] }) {
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

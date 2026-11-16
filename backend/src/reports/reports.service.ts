import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { suggestTargets } from '../profile/nutrition';
import { addDays } from '../weight/weight.math';
import { summarizeWeek } from '../workouts/workout.math';
import { buildWeeklyReport, type DayInput, pendingWeekStart, weekEndOf, weekStartOf } from './weekly.math';

const LIST_SCAN_DAYS = 400;

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private async profile(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');
    return profile;
  }

  /** Relatório da semana que contém `week`. Calculado na hora: refletir correções de dias passados é intencional. */
  async weekly(userId: string, week: string) {
    const profile = await this.profile(userId);
    const weekStart = weekStartOf(week, profile.weekStartsOn);
    if (weekStart > latestAllowedDay()) throw new BadRequestException('Essa semana ainda não começou');
    return this.build(userId, profile, weekStart);
  }

  private async build(userId: string, profile: Awaited<ReturnType<ReportsService['profile']>>, weekStart: string) {
    const weekEnd = weekEndOf(weekStart);
    const [meals, weights, workoutRows] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId, date: { gte: parseDay(weekStart), lte: parseDay(weekEnd) } },
        select: { date: true, type: true, items: { select: { kcal: true, protein: true, carbs: true, fat: true } } },
      }),
      this.prisma.weightEntry.findMany({
        where: { userId, date: { gte: parseDay(addDays(weekStart, -14)), lte: parseDay(weekEnd) } },
        select: { date: true, weightKg: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.workout.findMany({
        where: { userId, date: { gte: parseDay(weekStart), lte: parseDay(weekEnd) } },
        select: { type: true, durationMin: true },
      }),
    ]);

    const byDay = new Map<string, DayInput>();
    for (const m of meals) {
      if (m.items.length === 0) continue; // refeição vazia não conta como dia registrado
      const date = formatDay(m.date);
      const day = byDay.get(date) ?? { date, totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, byMeal: {} };
      const kcal = m.items.reduce((s, i) => s + i.kcal, 0);
      for (const i of m.items) {
        day.totals!.kcal += i.kcal;
        day.totals!.protein += i.protein;
        day.totals!.carbs += i.carbs;
        day.totals!.fat += i.fat;
      }
      day.byMeal[m.type as MealType] = (day.byMeal[m.type as MealType] ?? 0) + kcal;
      byDay.set(date, day);
    }

    // Treinos: só contexto (contagem e minutos). Não entram no balanço, que usa a meta BASE do perfil (sem o bônus
    // do treino do dia) e o gasto por fórmula; também não alteram a meta adaptativa.
    const workouts = summarizeWeek(workoutRows);

    const report = buildWeeklyReport({
      weekStart,
      days: [...byDay.values()],
      targets: {
        kcal: profile.kcalTarget,
        protein: profile.proteinTarget,
        carbs: profile.carbsTarget,
        fat: profile.fatTarget,
      },
      tdee: suggestTargets(profile).tdee,
      sex: profile.sex,
      hideWeight: profile.hideWeightInReports,
      weights: weights.map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg })),
    });
    return { ...report, workouts };
  }

  /** Dias com ao menos uma refeição com alimentos, do mais recente para o mais antigo. */
  private async loggedDates(userId: string, from?: string, to?: string): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ date: string }[]>`
      SELECT DISTINCT m."date"::text AS date
        FROM meals m
       WHERE m."userId" = ${userId}::uuid
         AND (${from ?? null}::date IS NULL OR m."date" >= ${from ?? null}::date)
         AND (${to ?? null}::date IS NULL OR m."date" <= ${to ?? null}::date)
         AND EXISTS (SELECT 1 FROM meal_items i WHERE i."mealId" = m.id)
       ORDER BY 1 DESC
       LIMIT ${LIST_SCAN_DAYS}`;
    return rows.map((r) => r.date);
  }

  /** Últimas semanas com algum registro (no máximo 12). */
  async list(userId: string, limit = 12) {
    const profile = await this.profile(userId);
    const weeks = new Map<string, number>();
    for (const date of await this.loggedDates(userId)) {
      const start = weekStartOf(date, profile.weekStartsOn);
      weeks.set(start, (weeks.get(start) ?? 0) + 1);
    }
    return [...weeks.entries()]
      .slice(0, Math.min(limit, 12))
      .map(([weekStart, loggedDays]) => ({ weekStart, weekEnd: weekEndOf(weekStart), loggedDays }));
  }

  /**
   * A semana a destacar agora, ou null. Só diz qual é (e se tem ao menos 1 dia registrado);
   * dispensar é decisão do cliente.
   */
  async pending(userId: string, today: string, hour: number) {
    if (today > latestAllowedDay()) throw new BadRequestException('Data inválida');
    const profile = await this.profile(userId);
    const weekStart = pendingWeekStart(today, hour, profile.weekStartsOn);
    const weekEnd = weekEndOf(weekStart);
    const dates = await this.loggedDates(userId, weekStart, weekEnd);
    if (dates.length === 0) return null;
    return { weekStart, weekEnd, loggedDays: dates.length };
  }
}

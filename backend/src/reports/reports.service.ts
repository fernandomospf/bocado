import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MealType } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { recentLoggedKcal } from '../glp1/glp1.data';
import { effectiveProteinFloor, isLowIntake, proteinFloorDays, suggestProteinFloor, summarizeWellbeing } from '../profile/glp1';
import { suggestTargets } from '../profile/nutrition';
import { addDays, dayNumber, movingAverages, summarizeTrend } from '../weight/weight.math';
import { summarizeMovementWeek, summarizeWeek } from '../workouts/workout.math';
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
    const [meals, weights, workoutRows, waterDays, waterEntries] = await Promise.all([
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
        select: { date: true, type: true, intensity: true, durationMin: true },
      }),
      this.prisma.waterDay.findMany({ where: { userId, date: { gte: parseDay(weekStart), lte: parseDay(weekEnd) } } }),
      this.prisma.waterEntry.groupBy({
        by: ['date'],
        where: { userId, date: { gte: parseDay(weekStart), lte: parseDay(weekEnd) } },
        _sum: { amountMl: true },
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
    // Movimento: "meta batida em N de M dias ativos" (com o medidor ligado e uma meta diária). Treinos e minutos acima
    const mv = profile.movementEnabled
      ? summarizeMovementWeek({
          workouts: workoutRows.map((r) => ({ ...r, date: formatDay(r.date) })),
          today: weekStart,
          weekStartsOn: profile.weekStartsOn,
          dailyGoalMin: profile.movementDailyGoalMin ?? null,
          restDays: profile.movementRestDays ?? [],
          weightKg: 0,
          showEstimate: false,
        })
      : null;
    const movement = mv && mv.daysReached !== null ? { dailyGoalMin: mv.dailyGoalMin, daysReached: mv.daysReached, activeDays: mv.activeDays } : null;

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
    // Água (só com o contador ligado e ao menos 1 dia registrado): dias com a meta batida
    const goals = new Map(waterDays.map((d) => [formatDay(d.date), d.goalMl]));
    const waterLoggedDays = waterEntries.length;
    const waterGoalDays = waterEntries.filter((e) => {
      const goal = goals.get(formatDay(e.date));
      return goal !== undefined && (e._sum.amountMl ?? 0) >= goal;
    }).length;
    const water = profile.waterEnabled && waterLoggedDays > 0 ? { loggedDays: waterLoggedDays, goalDays: waterGoalDays } : null;

    // Meta de peso: quanto falta (só se a pessoa mostra o peso nos relatórios). Não entra em nenhum cálculo do relatório
    const weightGoal =
      !profile.hideWeightInReports && profile.goalWeightKg !== null && weights.length > 0
        ? { targetKg: profile.goalWeightKg, remainingKg: Math.round(Math.abs(movingAverages(weights.map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg }))).at(-1)!.trendKg - profile.goalWeightKg) * 10) / 10 }
        : null;

    const glp1 = profile.glp1Mode ? await this.glp1Block(userId, profile, weekStart, weekEnd, [...byDay.values()], weights) : null;
    // No modo GLP-1 o aviso da média semanal sai: vale só o aviso de segurança dos últimos 5 dias registrados (glp1.lowIntake)
    return { ...report, ...(glp1 ? { lowIntakeNote: false } : {}), workouts, movement, water, weightGoal, glp1 };
  }

  /**
   * Modo GLP-1 (privado, nunca vai para IA, admin ou casa): dias com o piso de proteína batido, resumo neutro do
   * bem-estar e o aviso de baixa ingestão. A água já vem no bloco `water` do relatório.
   */
  private async glp1Block(
    userId: string,
    profile: Awaited<ReturnType<ReportsService['profile']>>,
    weekStart: string,
    weekEnd: string,
    days: DayInput[],
    weights: { date: Date; weightKg: number }[],
  ) {
    const rows = await this.prisma.wellbeingLog.findMany({
      where: { userId, date: { gte: parseDay(weekStart), lte: parseDay(weekEnd) } },
      select: { nausea: true, appetite: true, energy: true, gi: true },
    });
    const trend = summarizeTrend(weights.filter((w) => formatDay(w.date) <= weekEnd).map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg }))).trendKg;
    const floor = effectiveProteinFloor(profile.proteinFloorG, suggestProteinFloor(profile.proteinTarget, trend ?? profile.weightKg));
    const upTo = weekEnd < latestAllowedDay() ? weekEnd : latestAllowedDay();
    return {
      proteinFloorG: floor,
      proteinFloorDays: proteinFloorDays(days.filter((d) => d.totals).map((d) => ({ protein: d.totals!.protein })), floor),
      wellbeing: rows.length > 0 ? summarizeWellbeing(rows) : null,
      lowIntake: isLowIntake(await recentLoggedKcal(this.prisma, userId, upTo), profile.sex),
    };
  }

  /**
   * Relatório para o nutricionista (período de até 93 dias): metas atuais, dia a dia, médias dos dias REGISTRADOS, peso
   * (tendência no início e no fim, a menos que a pessoa oculte o peso nos relatórios), água e treino. Nenhum dado
   * sensível de saúde (só alimentação, peso, água e treino). Só lê dados da própria pessoa.
   */
  async nutritionist(userId: string, from: string, to: string, opts: { foods?: boolean; includeName?: boolean } = {}) {
    const span = dayNumber(to) - dayNumber(from);
    if (Number.isNaN(span) || span < 0) throw new BadRequestException('Intervalo inválido');
    if (span > 92) throw new BadRequestException('Intervalo máximo de 93 dias');
    if (to > latestAllowedDay()) throw new BadRequestException('Data inválida');

    const [profile, user] = await Promise.all([this.profile(userId), this.prisma.user.findUnique({ where: { id: userId }, select: { name: true } })]);
    const range = { gte: parseDay(from), lte: parseDay(to) };
    const [meals, weights, waterEntries, workouts] = await Promise.all([
      this.prisma.meal.findMany({ where: { userId, date: range }, select: { date: true, type: true, items: { select: { name: true, grams: true, kcal: true, protein: true, carbs: true, fat: true } } } }),
      profile.hideWeightInReports
        ? Promise.resolve([])
        : this.prisma.weightEntry.findMany({ where: { userId, date: { gte: parseDay(addDays(from, -6)), lte: parseDay(to) } }, select: { date: true, weightKg: true }, orderBy: { date: 'asc' } }),
      profile.waterEnabled ? this.prisma.waterEntry.groupBy({ by: ['date'], where: { userId, date: range }, _sum: { amountMl: true } }) : Promise.resolve([]),
      this.prisma.workout.findMany({ where: { userId, date: range }, select: { type: true, durationMin: true } }),
    ]);

    const totals = new Map<string, { kcal: number; protein: number; carbs: number; fat: number }>();
    for (const m of meals) {
      if (m.items.length === 0) continue;
      const key = formatDay(m.date);
      const t = totals.get(key) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
      for (const i of m.items) {
        t.kcal += i.kcal;
        t.protein += i.protein;
        t.carbs += i.carbs;
        t.fat += i.fat;
      }
      totals.set(key, t);
    }
    const round1 = (n: number) => Math.round(n * 10) / 10;
    // Alimentos de cada refeição (só com a opção ligada): nome e gramas, na ordem do dia
    const MEAL_ORDER = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'] as const;
    const foodsByDay = new Map<string, { type: (typeof MEAL_ORDER)[number]; items: { name: string; grams: number }[] }[]>();
    if (opts.foods) {
      for (const m of meals) {
        if (m.items.length === 0) continue;
        const key = formatDay(m.date);
        const list = foodsByDay.get(key) ?? [];
        list.push({ type: m.type as (typeof MEAL_ORDER)[number], items: m.items.map((i) => ({ name: i.name, grams: round1(i.grams) })) });
        foodsByDay.set(key, list);
      }
      for (const list of foodsByDay.values()) list.sort((a, b) => MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type));
    }
    const days = Array.from({ length: span + 1 }, (_, i) => {
      const date = addDays(from, i);
      const t = totals.get(date);
      return {
        date,
        registered: !!t,
        kcal: t ? Math.round(t.kcal) : 0,
        protein: t ? round1(t.protein) : 0,
        carbs: t ? round1(t.carbs) : 0,
        fat: t ? round1(t.fat) : 0,
        ...(opts.foods ? { meals: foodsByDay.get(date) ?? [] } : {}),
      };
    });
    const logged = days.filter((d) => d.registered);
    const avg = (k: 'kcal' | 'protein' | 'carbs' | 'fat') => (logged.length ? round1(logged.reduce((s, d) => s + d[k], 0) / logged.length) : null);

    const trend = movingAverages(weights.map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg }))).filter((p) => p.date >= from);
    const weight = trend.length ? { start: { date: trend[0].date, trendKg: round1(trend[0].trendKg) }, end: { date: trend.at(-1)!.date, trendKg: round1(trend.at(-1)!.trendKg) }, entries: trend.length } : null;

    const water = waterEntries.length ? { loggedDays: waterEntries.length, avgMl: Math.round(waterEntries.reduce((s, e) => s + (e._sum.amountMl ?? 0), 0) / waterEntries.length) } : null;
    const workoutSummary = workouts.length ? { count: workouts.length, totalMinutes: workouts.reduce((s, w) => s + w.durationMin, 0) } : null;

    return {
      name: opts.includeName === false ? '' : (user?.name ?? ''),
      foods: !!opts.foods,
      from,
      to,
      hideCalories: profile.hideCalories,
      targets: { kcal: profile.kcalTarget, protein: profile.proteinTarget, carbs: profile.carbsTarget, fat: profile.fatTarget },
      days,
      loggedDays: logged.length,
      totalDays: days.length,
      averages: { kcal: avg('kcal'), protein: avg('protein'), carbs: avg('carbs'), fat: avg('fat') },
      weight,
      water,
      workouts: workoutSummary,
    };
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

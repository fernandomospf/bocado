import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Profile } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ageFrom } from '../profile/nutrition';
import { addDays, dayNumber, summarizeTrend } from '../weight/weight.math';
import {
  computeStreak,
  computeWaterGoal,
  DAY_MAX_ML,
  goalReached,
  WATER_RECALC_MIN_DIFF_ML,
} from './water.math';

const MAX_RANGE_DAYS = 93;
const STREAK_WINDOW_DAYS = 400;

export interface WaterGoalInfo {
  goalMl: number | null;
  source: 'auto' | 'manual';
  /** Menor de 18 anos (ou modo manual sem valor): a pessoa precisa definir a própria meta. */
  needsManualGoal: boolean;
  explain: { weightKg: number | null; baseMl: number | null; workoutMl: number | null };
}

/**
 * Contador de água. A água dos alimentos e das bebidas registradas nas REFEIÇÕES não conta automaticamente: este contador
 * soma só o que a pessoa registra aqui (copo, garrafa…). Os dados são sempre do usuário da sessão.
 *
 * O servidor não sabe o fuso da pessoa: as datas são "YYYY-MM-DD" locais enviadas pelo app. "Hoje" (para recalcular a
 * meta) é qualquer data na janela [UTC-1 dia, UTC+1 dia], que cobre o "hoje" de todos os fusos; dias fora dela ficam
 * congelados.
 */
@Injectable()
export class WaterService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------- meta

  private isTodayish(date: string, now = new Date()): boolean {
    const diff = dayNumber(date) - dayNumber(now.toISOString().slice(0, 10));
    return diff >= -1 && diff <= 1;
  }

  /** Aceita até 1 dia à frente do UTC (quem está à frente de Greenwich); o app limita ao dia local. */
  private assertNotFuture(date: string, now = new Date()) {
    if (dayNumber(date) > dayNumber(now.toISOString().slice(0, 10)) + 1) throw new BadRequestException('A data não pode ser no futuro');
  }

  /** A meta que valeria na data (calculada com o peso e o treino DAQUELA data), sem gravar nada. */
  async goalFor(userId: string, date: string, profile?: Profile | null, now = new Date()): Promise<WaterGoalInfo> {
    const p = profile ?? (await this.prisma.profile.findUnique({ where: { userId } }));
    if (!p) throw new NotFoundException('Perfil ainda não criado');
    const under18 = ageFrom(p.birthDate, now) < 18;

    if (under18 || p.waterGoalMode === 'MANUAL') {
      const manual = p.waterGoalManualMl;
      return { goalMl: manual ?? null, source: 'manual', needsManualGoal: manual === null, explain: { weightKg: null, baseMl: null, workoutMl: null } };
    }

    const since = parseDay(addDays(date, -60));
    const [weights, workouts] = await Promise.all([
      this.prisma.weightEntry.findMany({ where: { userId, date: { gte: since, lte: parseDay(date) } }, orderBy: { date: 'asc' } }),
      this.prisma.workout.aggregate({ where: { userId, date: parseDay(date) }, _sum: { durationMin: true } }),
    ]);
    const trend = summarizeTrend(weights.map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg })));
    const weightKg = trend.trendKg ?? p.weightKg;
    const goal = computeWaterGoal({ weightKg, workoutMinutes: workouts._sum.durationMin ?? 0 });
    return { goalMl: goal.goalMl, source: 'auto', needsManualGoal: false, explain: { weightKg: Math.round(weightKg * 10) / 10, baseMl: goal.baseMl, workoutMl: goal.workoutMl } };
  }

  /** Garante o WaterDay: no primeiro acesso do dia grava a meta calculada; depois, nunca mais a recalcula aqui. */
  private async ensureDay(userId: string, date: string, profile: Profile): Promise<number | null> {
    const key = { userId_date: { userId, date: parseDay(date) } };
    const existing = await this.prisma.waterDay.findUnique({ where: key });
    if (existing) return existing.goalMl;
    const info = await this.goalFor(userId, date, profile);
    if (info.goalMl === null) return null;
    await this.prisma.waterDay.createMany({ data: [{ userId, date: parseDay(date), goalMl: info.goalMl }], skipDuplicates: true });
    return (await this.prisma.waterDay.findUnique({ where: key }))?.goalMl ?? info.goalMl;
  }

  /**
   * Recalcula a meta de HOJE depois de um peso, treino ou preferência mudar. Só atualiza um WaterDay que já existe
   * e só se a diferença for >= 100 ml. Dias passados nunca são recalculados.
   */
  async recalcAround(userId: string, date: string, now = new Date()): Promise<boolean> {
    if (!this.isTodayish(date, now)) return false;
    const existing = await this.prisma.waterDay.findUnique({ where: { userId_date: { userId, date: parseDay(date) } } });
    if (!existing) return false;
    const info = await this.goalFor(userId, date, undefined, now);
    if (info.goalMl === null || Math.abs(info.goalMl - existing.goalMl) < WATER_RECALC_MIN_DIFF_ML) return false;
    await this.prisma.waterDay.update({ where: { userId_date: { userId, date: parseDay(date) } }, data: { goalMl: info.goalMl } });
    return true;
  }

  /** Mudou a preferência de água: recalcula as datas que podem ser "hoje" em qualquer fuso. */
  async recalcToday(userId: string, now = new Date()) {
    const utc = now.toISOString().slice(0, 10);
    for (const d of [addDays(utc, -1), utc, addDays(utc, 1)]) await this.recalcAround(userId, d, now);
  }

  // ---------------------------------------------------------------- leitura

  async get(userId: string, date: string) {
    this.assertNotFuture(date);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');
    const goalMl = await this.ensureDay(userId, date, profile);
    const [entries, info] = await Promise.all([
      this.prisma.waterEntry.findMany({ where: { userId, date: parseDay(date) }, orderBy: { createdAt: 'asc' } }),
      this.goalFor(userId, date, profile),
    ]);
    return {
      date,
      goalMl,
      totalMl: entries.reduce((s, e) => s + e.amountMl, 0),
      entries: entries.map((e) => ({ id: e.id, amountMl: e.amountMl, createdAt: e.createdAt.toISOString() })),
      goalSource: info.source,
      needsManualGoal: info.needsManualGoal,
      explain: info.explain,
    };
  }

  /** Por dia: a meta que valia e o total. */
  async range(userId: string, from: string, to: string) {
    const days = dayNumber(to) - dayNumber(from);
    if (Number.isNaN(days) || days < 0) throw new BadRequestException('Intervalo inválido');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);
    return { from, to, days: await this.daysBetween(userId, from, to) };
  }

  private async daysBetween(userId: string, from: string, to: string) {
    const range = { gte: parseDay(from), lte: parseDay(to) };
    const [goals, entries] = await Promise.all([
      this.prisma.waterDay.findMany({ where: { userId, date: range } }),
      this.prisma.waterEntry.groupBy({ by: ['date'], where: { userId, date: range }, _sum: { amountMl: true } }),
    ]);
    const totals = new Map(entries.map((e) => [formatDay(e.date), e._sum.amountMl ?? 0]));
    const byDate = new Map(goals.map((g) => [formatDay(g.date), g.goalMl as number | null]));
    for (const d of totals.keys()) if (!byDate.has(d)) byDate.set(d, null);
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, goalMl]) => ({ date, goalMl, totalMl: totals.get(date) ?? 0 }));
  }

  async streak(userId: string, today: string) {
    const rows = await this.daysBetween(userId, addDays(today, -STREAK_WINDOW_DAYS), today);
    return computeStreak(rows.map((r) => ({ date: r.date, reached: goalReached(r.totalMl, r.goalMl) })), today);
  }

  // ---------------------------------------------------------------- escrita

  async add(userId: string, date: string, amountMl: number) {
    this.assertNotFuture(date);
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');
    const goalMl = await this.ensureDay(userId, date, profile);

    const entry = await this.prisma.$transaction(async (tx) => {
      // Duas anotações ao mesmo tempo não furam o limite do dia
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`water:${userId}:${date}`}))`;
      const sum = await tx.waterEntry.aggregate({ where: { userId, date: parseDay(date) }, _sum: { amountMl: true } });
      const total = (sum._sum.amountMl ?? 0) + amountMl;
      if (total > DAY_MAX_ML) {
        throw new UnprocessableEntityException(`Esse registro levaria o dia a mais de ${DAY_MAX_ML.toLocaleString('pt-BR')} ml. Confira o valor.`);
      }
      return tx.waterEntry.create({ data: { userId, date: parseDay(date), amountMl } });
    });
    const totalMl = (await this.prisma.waterEntry.aggregate({ where: { userId, date: parseDay(date) }, _sum: { amountMl: true } }))._sum.amountMl ?? 0;
    return { entry: { id: entry.id, amountMl: entry.amountMl, createdAt: entry.createdAt.toISOString() }, date, totalMl, goalMl };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.waterEntry.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Registro de água não encontrado');
  }
}

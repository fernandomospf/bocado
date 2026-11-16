import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdaptiveAction } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from '../profile/profile.service';
import { addDays } from '../weight/weight.math';
import {
  type AdaptiveInput,
  type AdaptiveResult,
  evaluateAdaptive,
  PAUSE_AFTER_DECISION_DAYS,
  WINDOW_DAYS,
} from './adaptive.math';
import { ApplyAdaptiveDto, DismissAction, DismissAdaptiveDto } from './dto/adaptive.dto';

@Injectable()
export class AdaptiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfileService,
  ) {}

  /** Lê os dados do usuário da sessão e roda o cálculo puro. Nada é gravado aqui. */
  private async evaluate(userId: string, today: string): Promise<{ result: AdaptiveResult; input: AdaptiveInput }> {
    if (today > latestAllowedDay()) throw new BadRequestException('Data inválida');
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');

    const from = parseDay(addDays(today, -(WINDOW_DAYS - 1)));
    const [meals, weights, first, last] = await Promise.all([
      this.prisma.meal.findMany({
        where: { userId, date: { gte: from, lte: parseDay(today) } },
        select: { date: true, items: { select: { kcal: true } } },
      }),
      this.prisma.weightEntry.findMany({
        where: { userId, date: { gte: from, lte: parseDay(today) } },
        select: { date: true, weightKg: true },
        orderBy: { date: 'asc' },
      }),
      this.prisma.meal.findFirst({ where: { userId }, orderBy: { date: 'asc' }, select: { date: true } }),
      this.prisma.adaptiveAdjustment.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    ]);

    const byDay = new Map<string, number>();
    for (const m of meals) {
      if (m.items.length === 0) continue;
      const date = formatDay(m.date);
      byDay.set(date, (byDay.get(date) ?? 0) + m.items.reduce((s, i) => s + i.kcal, 0));
    }

    const input: AdaptiveInput = {
      today,
      // Com "esconder calorias" nenhuma sugestão é calculada nem aplicada (a preferência guardada não muda)
      enabled: profile.adaptiveEnabled && !profile.hideCalories,
      snoozedUntil: profile.adaptiveSnoozedUntil ? formatDay(profile.adaptiveSnoozedUntil) : null,
      lastDecisionDate: last ? formatDay(last.createdAt) : null,
      firstMealDate: first ? formatDay(first.date) : null,
      days: [...byDay.entries()].map(([date, kcal]) => ({ date, kcal })),
      weights: weights.map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg })),
      profile: {
        sex: profile.sex,
        birthDate: profile.birthDate,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        goal: profile.goal,
        targets: { kcal: profile.kcalTarget, protein: profile.proteinTarget, carbs: profile.carbsTarget, fat: profile.fatTarget },
      },
    };
    return { result: evaluateAdaptive(input), input };
  }

  async status(userId: string, today: string) {
    const { result, input } = await this.evaluate(userId, today);
    return { enabled: input.enabled, ...result };
  }

  /**
   * Aplica a sugestão. Recalcula NO SERVIDOR: o cliente só diz qual meta viu (expectedKcal). Se a sugestão atual for
   * outra (diferença > 20 kcal) ou deixou de existir, responde 409 com o estado novo.
   */
  async apply(userId: string, dto: ApplyAdaptiveDto) {
    const { result, input } = await this.evaluate(userId, dto.today);
    const s = result.suggestion;
    if (result.state !== 'suggestion' || !s || !result.estimate || Math.abs(s.newKcal - dto.expectedKcal) > 20) {
      throw new ConflictException({
        statusCode: 409,
        message: 'A sugestão mudou. Confira os novos números.',
        status: { enabled: input.enabled, ...result },
      });
    }
    const e = result.estimate;
    const profile = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });

    await this.prisma.$transaction([
      this.prisma.profile.update({
        where: { userId },
        data: {
          kcalTarget: s.newKcal,
          proteinTarget: s.macros.protein,
          carbsTarget: s.macros.carbs,
          fatTarget: s.macros.fat,
          customTargets: true,
          targetsWeightKg: profile.weightKg,
        },
      }),
      this.prisma.adaptiveAdjustment.create({
        data: {
          userId,
          action: AdaptiveAction.APPLIED,
          windowStart: parseDay(e.windowStart),
          windowEnd: parseDay(e.windowEnd),
          avgIntake: e.avgIntake,
          weightStartKg: e.weightStartKg,
          weightEndKg: e.weightEndKg,
          estimatedTdee: e.tdee,
          confidence: e.confidence,
          previousKcal: s.currentKcal,
          newKcal: s.newKcal,
        },
      }),
    ]);
    return this.profiles.get(userId);
  }

  /** "Manter a minha" (DISMISSED) ou "Lembrar depois" (SNOOZED): grava a decisão e pausa novas sugestões. */
  async dismiss(userId: string, dto: DismissAdaptiveDto) {
    const { result } = await this.evaluate(userId, dto.today);
    if (result.state !== 'suggestion' || !result.suggestion || !result.estimate) {
      throw new BadRequestException('Não há sugestão para dispensar agora');
    }
    const e = result.estimate;
    const days = dto.snoozeDays ?? PAUSE_AFTER_DECISION_DAYS;
    const until = addDays(dto.today, days);

    await this.prisma.$transaction([
      this.prisma.adaptiveAdjustment.create({
        data: {
          userId,
          action: dto.action === DismissAction.SNOOZED ? AdaptiveAction.SNOOZED : AdaptiveAction.DISMISSED,
          windowStart: parseDay(e.windowStart),
          windowEnd: parseDay(e.windowEnd),
          avgIntake: e.avgIntake,
          weightStartKg: e.weightStartKg,
          weightEndKg: e.weightEndKg,
          estimatedTdee: e.tdee,
          confidence: e.confidence,
          previousKcal: result.suggestion.currentKcal,
          newKcal: null,
        },
      }),
      this.prisma.profile.update({ where: { userId }, data: { adaptiveSnoozedUntil: parseDay(until) } }),
    ]);
    return { snoozedUntil: until };
  }

  async history(userId: string, limit = 10) {
    const rows = await this.prisma.adaptiveAdjustment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 50),
    });
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      previousKcal: r.previousKcal,
      newKcal: r.newKcal,
      estimatedTdee: Math.round(r.estimatedTdee),
      confidence: r.confidence,
      windowStart: formatDay(r.windowStart),
      windowEnd: formatDay(r.windowEnd),
    }));
  }
}

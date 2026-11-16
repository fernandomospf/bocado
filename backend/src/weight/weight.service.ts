import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Profile, WeightEntry } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ageFrom } from '../profile/nutrition';
import { WaterService } from '../water/water.service';
import { SaveWeightDto } from './dto/weight.dto';
import { goalProblem, goalProgress, type GoalSummary, UNDER_18_MESSAGE } from './weight.goal';
import { addDays, dayNumber, isTargetsOutdated, movingAverages, summarizeTrend, TREND_WINDOW_DAYS } from './weight.math';

const MAX_RANGE_DAYS = 366;

@Injectable()
export class WeightService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly water?: WaterService,
  ) {}

  /** Registros do período, cada um com a média móvel de 7 dias (que usa também os 6 dias antes de `from`). */
  async list(userId: string, from: string, to: string) {
    const days = dayNumber(to) - dayNumber(from);
    if (Number.isNaN(days) || days < 0) throw new BadRequestException('Intervalo inválido');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);

    const rows = await this.prisma.weightEntry.findMany({
      where: { userId, date: { gte: parseDay(addDays(from, -(TREND_WINDOW_DAYS - 1))), lte: parseDay(to) } },
      orderBy: { date: 'asc' },
    });
    const notes = new Map(rows.map((r) => [formatDay(r.date), r.note]));
    const entries = movingAverages(rows.map(toPoint))
      .filter((p) => p.date >= from)
      .map((p) => ({ ...p, note: notes.get(p.date) ?? null }));
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { goalWeightKg: true } });
    // goalWeightKg: a linha-alvo do gráfico
    return { from, to, entries, goalWeightKg: profile?.goalWeightKg ?? null };
  }

  async summary(userId: string) {
    const latest = await this.prisma.weightEntry.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    const targetsWeightKg = profile?.targetsWeightKg ?? null;
    if (!latest) {
      return {
        latest: null,
        trendKg: null,
        change7Kg: null,
        change30Kg: null,
        targetsWeightKg,
        targetsOutdated: false,
        goal: profile ? goalOf(profile, null, profile.weightKg) : null,
      };
    }

    // Referência da variação de 30 dias: último registro até 30 dias antes do mais recente (pode ser bem antigo).
    // Buscando a partir da janela de 7 dias dela, a referência de 7 dias também fica coberta.
    const latestDay = formatDay(latest.date);
    const ref = await this.prisma.weightEntry.findFirst({
      where: { userId, date: { lte: parseDay(addDays(latestDay, -30)) } },
      orderBy: { date: 'desc' },
    });
    const since = addDays(ref ? formatDay(ref.date) : addDays(latestDay, -30), -(TREND_WINDOW_DAYS - 1));
    const rows = await this.prisma.weightEntry.findMany({
      where: { userId, date: { gte: parseDay(since) } },
      orderBy: { date: 'asc' },
    });
    const trend = summarizeTrend(rows.map(toPoint));
    return {
      ...trend,
      targetsWeightKg,
      targetsOutdated: isTargetsOutdated(trend.trendKg, targetsWeightKg),
      goal: profile ? goalOf(profile, trend.trendKg, latest.weightKg) : null,
    };
  }

  /**
   * Meta de peso. O "peso atual" é a tendência de 7 dias (sem tendência, o último peso). `null` remove a meta.
   * Nunca altera o objetivo do perfil nem as metas de calorias: se a meta diverge do objetivo, explica (422).
   */
  async setGoal(userId: string, goalWeightKg: number | null, now = new Date()) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');

    if (goalWeightKg === null) {
      await this.prisma.profile.update({ where: { userId }, data: { goalWeightKg: null, goalStartWeightKg: null, goalSetAt: null } });
      return { goal: null };
    }

    if (ageFrom(profile.birthDate, now) < 18) throw new ForbiddenException(UNDER_18_MESSAGE);

    const { trendKg, latestKg } = await this.currentWeight(userId, profile);
    const currentKg = trendKg ?? latestKg;
    const problem = goalProblem({ goalKg: goalWeightKg, currentKg, heightCm: profile.heightCm, goal: profile.goal });
    if (problem) throw new UnprocessableEntityException(problem);

    const updated = await this.prisma.profile.update({
      where: { userId },
      data: { goalWeightKg, goalStartWeightKg: currentKg, goalSetAt: parseDay(now.toISOString().slice(0, 10)) },
    });
    return { goal: goalOf(updated, trendKg, latestKg) };
  }

  /** Tendência atual (ou o último peso) do usuário. */
  private async currentWeight(userId: string, profile: Profile) {
    const since = addDays(new Date().toISOString().slice(0, 10), -60);
    const rows = await this.prisma.weightEntry.findMany({
      where: { userId, date: { gte: parseDay(since) } },
      orderBy: { date: 'asc' },
    });
    const latestRow = rows.at(-1) ?? (await this.prisma.weightEntry.findFirst({ where: { userId }, orderBy: { date: 'desc' } }));
    const trend = summarizeTrend(rows.map(toPoint));
    return { trendKg: trend.trendKg, latestKg: latestRow?.weightKg ?? profile.weightKg };
  }

  /** Upsert do dia: um registro por (usuário, data). */
  async save(userId: string, date: string, dto: SaveWeightDto) {
    assertNotFuture(date);
    const day = parseDay(date);
    // Sem o campo `note`, mantém a nota existente do dia (ex.: peso atualizado pelo formulário de dados)
    const note = dto.note === undefined ? undefined : dto.note || null;
    const entry = await this.prisma.weightEntry.upsert({
      where: { userId_date: { userId, date: day } },
      create: { userId, date: day, weightKg: dto.weightKg, note: note ?? null },
      update: { weightKg: dto.weightKg, ...(note !== undefined ? { note } : {}) },
    });
    await this.syncProfileWeight(userId);
    // A meta de água de hoje acompanha o peso (só muda se a diferença for >= 100 ml)
    await this.water?.recalcAround(userId, date);
    return serialize(entry);
  }

  async remove(userId: string, date: string) {
    const { count } = await this.prisma.weightEntry.deleteMany({ where: { userId, date: parseDay(date) } });
    if (count === 0) throw new NotFoundException('Registro de peso não encontrado');
    await this.syncProfileWeight(userId);
    await this.water?.recalcAround(userId, date);
  }

  /** O peso do perfil acompanha o registro mais recente. As metas não são recalculadas aqui. */
  private async syncProfileWeight(userId: string) {
    const latest = await this.prisma.weightEntry.findFirst({ where: { userId }, orderBy: { date: 'desc' } });
    if (!latest) return;
    await this.prisma.profile.updateMany({ where: { userId }, data: { weightKg: latest.weightKg } });
  }
}

/**
 * O servidor não sabe o fuso do usuário: aceita até 1 dia à frente do UTC, para não recusar o "hoje" de quem está
 * à frente de Greenwich. O app limita a data ao dia local de hoje.
 */
function assertNotFuture(date: string, now = new Date()) {
  const todayUtc = now.toISOString().slice(0, 10);
  if (dayNumber(date) > dayNumber(todayUtc) + 1) throw new BadRequestException('A data não pode ser no futuro');
}

/** Resumo da meta de peso a partir do perfil (null sem meta). */
function goalOf(p: Pick<Profile, 'goalWeightKg' | 'goalStartWeightKg'>, trendKg: number | null, latestKg: number): GoalSummary | null {
  if (p.goalWeightKg === null || p.goalWeightKg === undefined) return null;
  const currentKg = trendKg ?? latestKg;
  return goalProgress({ targetKg: p.goalWeightKg, startKg: p.goalStartWeightKg ?? currentKg, currentKg });
}

const toPoint = (e: Pick<WeightEntry, 'date' | 'weightKg'>) => ({ date: formatDay(e.date), weightKg: e.weightKg });

function serialize(e: WeightEntry) {
  return { date: formatDay(e.date), weightKg: e.weightKg, note: e.note };
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, Profile, WeightEntry } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ageFrom } from '../profile/nutrition';
import { WaterService } from '../water/water.service';
import { ImportWeightDto, SaveWeightDto } from './dto/weight.dto';
import { normalizeImport } from './weight-import';
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

  /**
   * Importa um lote de pesos (o app divide em lotes de até 5.000 do MESMO import, repassando o `importId`).
   * "keep" nunca toca em registros existentes; "replace" sobrescreve o valor do dia (a nota fica). Só os registros CRIADOS
   * pela importação ficam ligados a ela (desfazer apaga só esses; os substituídos mantêm o valor importado).
   * Perfil: o peso só acompanha se o dia mais recente do lote não for anterior ao último registro. As metas de calorias
   * não mudam; a meta de água de hoje é recalculada pela regra existente.
   */
  async importBatch(userId: string, dto: ImportWeightDto, now = new Date()) {
    const maxDate = addDays(now.toISOString().slice(0, 10), 1);
    const { entries, discarded } = normalizeImport(dto.entries, maxDate);
    if (entries.length === 0) throw new BadRequestException('Nenhum registro válido para importar');

    if (dto.importId) {
      const own = await this.prisma.weightImport.findFirst({ where: { id: dto.importId, userId, source: dto.source }, select: { id: true } });
      if (!own) throw new NotFoundException('Importação não encontrada');
    }
    const previousLatest = await this.prisma.weightEntry.findFirst({ where: { userId }, orderBy: { date: 'desc' }, select: { date: true } });

    const dates = entries.map((e) => e.date);
    const kgs = entries.map((e) => e.weightKg);
    const result = await this.prisma.$transaction(async (tx) => {
      const imp = dto.importId
        ? { id: dto.importId }
        : await tx.weightImport.create({ data: { userId, source: dto.source }, select: { id: true } });
      const onConflict =
        dto.conflict === 'replace'
          ? Prisma.sql`ON CONFLICT ("userId", "date") DO UPDATE SET "weightKg" = EXCLUDED."weightKg"`
          : Prisma.sql`ON CONFLICT ("userId", "date") DO NOTHING`;
      // `xmax = 0` só nas linhas inseridas de verdade (as atualizadas pelo conflito têm xmax diferente de zero)
      const rows = await tx.$queryRaw<{ inserted: boolean }[]>`
        INSERT INTO weight_entries (id, "userId", "date", "weightKg", "importId", "createdAt")
        SELECT gen_random_uuid(), ${userId}::uuid, d, k, ${imp.id}::uuid, now()
          FROM unnest(${dates}::date[], ${kgs}::float8[]) AS t(d, k)
        ${onConflict}
        RETURNING (xmax = 0) AS inserted`;
      const created = rows.filter((r) => r.inserted).length;
      const touched = rows.length; // keep: só as criadas; replace: criadas + substituídas
      await tx.weightImport.update({ where: { id: imp.id }, data: { count: { increment: created } } });
      return {
        importId: imp.id,
        created,
        replaced: dto.conflict === 'replace' ? touched - created : 0,
        kept: dto.conflict === 'keep' ? entries.length - created : 0,
      };
    });

    const lastImported = entries[entries.length - 1].date;
    if (!previousLatest || lastImported >= formatDay(previousLatest.date)) await this.syncProfileWeight(userId);
    await this.water?.recalcToday(userId, now);
    return { ...result, discarded, received: dto.entries.length, period: { from: entries[0].date, to: lastImported } };
  }

  /** Importações da pessoa, da mais recente para a mais antiga (Perfil > Peso > Importar histórico). */
  async listImports(userId: string) {
    const rows = await this.prisma.weightImport.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 });
    return rows.map((r) => ({ id: r.id, source: r.source, createdAt: r.createdAt.toISOString(), count: r.count }));
  }

  /** Desfaz: apaga só os registros que a importação CRIOU. Os valores que ela substituiu não voltam. */
  async undoImport(userId: string, id: string, now = new Date()) {
    const imp = await this.prisma.weightImport.findFirst({ where: { id, userId }, select: { id: true } });
    if (!imp) throw new NotFoundException('Importação não encontrada');
    const { deleted } = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.weightEntry.deleteMany({ where: { userId, importId: id } });
      await tx.weightImport.delete({ where: { id } });
      return { deleted: count };
    });
    await this.syncProfileWeight(userId);
    await this.water?.recalcToday(userId, now);
    return { deleted };
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

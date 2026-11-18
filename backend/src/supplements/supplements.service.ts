import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectionSite, IntakeLog, Prisma, Slot, SupplementPlan } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, dayNumber } from '../weight/weight.math';
import {
  CalendarQueryDto,
  CreatePlanDto,
  HistoryQueryDto,
  LogDto,
  PlansQueryDto,
  RangeQueryDto,
  SkipDto,
  UpdateLogDto,
  UpdatePlanDto,
} from './dto/supplements.dto';
import { buildIcs } from './supplements.ics';
import { cleanPlan, type PlanInput } from './supplements.plan';
import {
  dueOn,
  type LastLog,
  MAX_ACTIVE_PLANS,
  MAX_LOG_AGE_DAYS,
  nextDue,
  type PlanSchedule,
  suggestedSite,
  windowDates,
} from './supplements.schedule';

const MAX_RANGE_DAYS = 366;
const SLOT_ORDER: Slot[] = ['ANY', 'MORNING', 'AFTERNOON', 'NIGHT'];
const NEXT_WINDOW_DAYS = 7;

export type ItemStatus = 'pending' | 'taken' | 'skipped' | 'unlogged';

/** Plano do banco como o agendador o enxerga (datas em texto). */
const schedule = (p: SupplementPlan): PlanSchedule => ({
  scheduleType: p.scheduleType,
  weekdays: p.weekdays,
  intervalDays: p.intervalDays,
  startDate: formatDay(p.startDate),
  endDate: p.endDate ? formatDay(p.endDate) : null,
});

const serializePlan = (p: SupplementPlan, nextDate: string | null) => ({
  id: p.id,
  name: p.name,
  category: p.category,
  administration: p.administration,
  doseAmount: p.doseAmount,
  doseUnit: p.doseUnit,
  doseUnitLabel: p.doseUnitLabel,
  scheduleType: p.scheduleType,
  weekdays: p.weekdays,
  intervalDays: p.intervalDays,
  slots: p.slots,
  startDate: formatDay(p.startDate),
  endDate: p.endDate ? formatDay(p.endDate) : null,
  notes: p.notes,
  trackSite: p.trackSite,
  showOnWeightChart: p.showOnWeightChart,
  archived: p.archivedAt !== null,
  nextDate,
  createdAt: p.createdAt,
});

const serializeLog = (l: IntakeLog) => ({
  id: l.id,
  planId: l.planId,
  date: formatDay(l.date),
  slot: l.slot,
  status: l.status,
  takenAt: l.takenAt,
  doseAmount: l.doseAmount,
  doseUnit: l.doseUnit,
  doseUnitLabel: l.doseUnitLabel,
  site: l.site,
  note: l.note,
});

function rangeDays(from: string, to: string) {
  const days = dayNumber(to) - dayNumber(from);
  if (Number.isNaN(days) || days < 0) throw new BadRequestException('Intervalo inválido');
  if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);
}

/**
 * Suplementos e medicações: SÓ registra o que a pessoa informa. Nenhuma recomendação, cálculo, validação de faixa de dose
 * nem conversão de unidade. Toda consulta filtra pelo usuário da sessão; nada daqui alimenta relatórios, casa, admin, IA
 * ou logs (veja SupplementsExceptionFilter). O acesso (idade e preferência) é conferido pelo SupplementsGuard.
 */
@Injectable()
export class SupplementsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- planos -----------------------------------------------------------------

  private async owned(userId: string, id: string) {
    const plan = await this.prisma.supplementPlan.findFirst({ where: { id, userId } });
    if (!plan) throw new NotFoundException('Item não encontrado');
    return plan;
  }

  private async assertRoomForActivePlan(userId: string) {
    const active = await this.prisma.supplementPlan.count({ where: { userId, archivedAt: null } });
    if (active >= MAX_ACTIVE_PLANS) throw new ConflictException(`Limite de ${MAX_ACTIVE_PLANS} itens ativos`);
  }

  /** Mais recente registro (TAKEN ou SKIPPED) de cada plano: âncora do "a cada N dias". */
  private async lastLogDates(userId: string, planIds: string[], upTo?: string) {
    if (planIds.length === 0) return new Map<string, string>();
    const rows = await this.prisma.intakeLog.groupBy({
      by: ['planId'],
      where: { userId, planId: { in: planIds }, ...(upTo ? { date: { lte: parseDay(upTo) } } : {}) },
      _max: { date: true },
    });
    return new Map(rows.flatMap((r) => (r._max.date ? [[r.planId, formatDay(r._max.date)] as const] : [])));
  }

  async listPlans(userId: string, { today }: PlansQueryDto) {
    const from = today ?? latestAllowedDay();
    const plans = await this.prisma.supplementPlan.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    const rolling = plans.filter((p) => p.scheduleType === 'EVERY_N_DAYS' && !p.archivedAt).map((p) => p.id);
    const last = await this.lastLogDates(userId, rolling);
    return {
      plans: plans.map((p) => {
        const lastLog: LastLog | null = last.has(p.id) ? { date: last.get(p.id)! } : null;
        return serializePlan(p, p.archivedAt ? null : nextDue(schedule(p), from, lastLog));
      }),
    };
  }

  async createPlan(userId: string, dto: CreatePlanDto) {
    await this.assertRoomForActivePlan(userId);
    const data = cleanPlan(dto);
    const plan = await this.prisma.supplementPlan.create({
      data: { userId, ...data, startDate: parseDay(data.startDate), endDate: data.endDate ? parseDay(data.endDate) : null },
    });
    return serializePlan(plan, nextDue(schedule(plan), data.startDate));
  }

  /** Mudar a dose do plano NÃO altera o histórico: cada registro guarda a dose da época. */
  async updatePlan(userId: string, id: string, dto: UpdatePlanDto) {
    const existing = await this.owned(userId, id);
    const merged: PlanInput = {
      name: dto.name ?? existing.name,
      category: dto.category ?? existing.category,
      administration: dto.administration ?? existing.administration,
      doseAmount: dto.doseAmount ?? existing.doseAmount,
      doseUnit: dto.doseUnit ?? existing.doseUnit,
      doseUnitLabel: dto.doseUnitLabel !== undefined ? dto.doseUnitLabel : existing.doseUnitLabel,
      scheduleType: dto.scheduleType ?? existing.scheduleType,
      weekdays: dto.weekdays ?? existing.weekdays,
      intervalDays: dto.intervalDays !== undefined ? dto.intervalDays : existing.intervalDays,
      slots: dto.slots ?? existing.slots,
      startDate: dto.startDate ?? formatDay(existing.startDate),
      endDate: dto.endDate !== undefined ? dto.endDate : existing.endDate ? formatDay(existing.endDate) : null,
      notes: dto.notes !== undefined ? dto.notes : existing.notes,
      trackSite: dto.trackSite ?? existing.trackSite,
      showOnWeightChart: dto.showOnWeightChart ?? existing.showOnWeightChart,
    };
    const data = cleanPlan(merged);
    const plan = await this.prisma.supplementPlan.update({
      where: { id },
      data: { ...data, startDate: parseDay(data.startDate), endDate: data.endDate ? parseDay(data.endDate) : null },
    });
    return serializePlan(plan, null);
  }

  /** Apaga o plano E todo o histórico (cascata). Para manter o histórico, arquive. */
  async deletePlan(userId: string, id: string) {
    const { count } = await this.prisma.supplementPlan.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Item não encontrado');
  }

  async archive(userId: string, id: string) {
    await this.owned(userId, id);
    const plan = await this.prisma.supplementPlan.update({ where: { id }, data: { archivedAt: new Date() } });
    return serializePlan(plan, null);
  }

  async unarchive(userId: string, id: string) {
    const existing = await this.owned(userId, id);
    if (existing.archivedAt) await this.assertRoomForActivePlan(userId);
    const plan = await this.prisma.supplementPlan.update({ where: { id }, data: { archivedAt: null } });
    return serializePlan(plan, nextDue(schedule(plan), latestAllowedDay()));
  }

  // --- o dia --------------------------------------------------------------------

  /**
   * Itens do dia (com as pendências dos 3 dias anteriores), as próximas doses dos próximos 7 dias e o local sugerido de
   * cada injetável com rodízio. "Hoje" é o dia pedido (o servidor não conhece o fuso).
   */
  async day(userId: string, date: string) {
    const windowStart = addDays(date, -3);
    const plans = await this.prisma.supplementPlan.findMany({ where: { userId, archivedAt: null }, orderBy: { createdAt: 'asc' } });
    const ids = plans.map((p) => p.id);
    const rollingIds = plans.filter((p) => p.scheduleType === 'EVERY_N_DAYS').map((p) => p.id);
    const injectionIds = plans.filter((p) => p.administration === 'INJECTION' && p.trackSite).map((p) => p.id);

    const [logs, beforeWindow, lastSites] = await Promise.all([
      ids.length
        ? this.prisma.intakeLog.findMany({ where: { userId, planId: { in: ids }, date: { gte: parseDay(windowStart), lte: parseDay(date) } } })
        : [],
      this.lastLogDates(userId, rollingIds, addDays(windowStart, -1)),
      injectionIds.length
        ? this.prisma.intakeLog.findMany({
            where: { userId, planId: { in: injectionIds }, site: { not: null } },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            distinct: ['planId'],
            select: { planId: true, date: true, site: true },
          })
        : [],
    ]);

    const byKey = new Map(logs.map((l) => [`${l.planId}|${formatDay(l.date)}|${l.slot}`, l]));
    /** Último registro do plano estritamente ANTES de `d`. */
    const lastBefore = (planId: string, d: string): LastLog | null => {
      let best = beforeWindow.get(planId) ?? null;
      for (const l of logs) {
        const ld = formatDay(l.date);
        if (l.planId === planId && ld < d && (best === null || ld > best)) best = ld;
      }
      return best ? { date: best } : null;
    };

    const items: {
      planId: string;
      name: string;
      category: SupplementPlan['category'];
      administration: SupplementPlan['administration'];
      trackSite: boolean;
      doseAmount: number;
      doseUnit: SupplementPlan['doseUnit'];
      doseUnitLabel: string | null;
      slot: Slot;
      status: ItemStatus;
      logId?: string;
      takenAt?: Date | null;
      site?: InjectionSite | null;
      dueDate: string;
    }[] = [];

    for (const d of windowDates(date)) {
      for (const plan of plans) {
        if (!dueOn(schedule(plan), d, lastBefore(plan.id, d))) continue;
        for (const slot of [...plan.slots].sort((a, b) => SLOT_ORDER.indexOf(a) - SLOT_ORDER.indexOf(b))) {
          const log = byKey.get(`${plan.id}|${d}|${slot}`);
          // Dias anteriores: só o que ficou sem registro; o que já foi registrado ou pulado não volta
          if (log && d < date) continue;
          items.push({
            planId: plan.id,
            name: plan.name,
            category: plan.category,
            administration: plan.administration,
            trackSite: plan.trackSite,
            doseAmount: log ? log.doseAmount : plan.doseAmount,
            doseUnit: log ? log.doseUnit : plan.doseUnit,
            doseUnitLabel: log ? log.doseUnitLabel : plan.doseUnitLabel,
            slot,
            status: log ? (log.status === 'TAKEN' ? 'taken' : 'skipped') : d === date ? 'pending' : 'unlogged',
            ...(log ? { logId: log.id, takenAt: log.takenAt, site: log.site } : {}),
            dueDate: d,
          });
        }
      }
    }

    // Próximas doses (a partir do dia seguinte, até 7 dias), com a âncora do rolling até o dia pedido
    const lastUpToDate = await this.lastLogDates(userId, rollingIds, date);
    const horizon = addDays(date, NEXT_WINDOW_DAYS);
    const next = plans
      .flatMap((p) => {
        const n = nextDue(schedule(p), addDays(date, 1), lastUpToDate.has(p.id) ? { date: lastUpToDate.get(p.id)! } : null);
        return n && n <= horizon ? [{ planId: p.id, name: p.name, nextDate: n }] : [];
      })
      .sort((a, b) => a.nextDate.localeCompare(b.nextDate));

    const suggestedSites: Record<string, InjectionSite> = {};
    for (const id of injectionIds) {
      const row = lastSites.find((s) => s.planId === id);
      suggestedSites[id] = suggestedSite(row ? [{ date: formatDay(row.date), site: row.site }] : []);
    }

    return { items, next, suggestedSites };
  }

  // --- registros ----------------------------------------------------------------

  private assertLogDate(date: string) {
    const latest = latestAllowedDay();
    if (date > latest) throw new BadRequestException('Não dá para registrar em um dia futuro');
    if (date < addDays(latest, -MAX_LOG_AGE_DAYS)) throw new BadRequestException(`Só é possível registrar os últimos ${MAX_LOG_AGE_DAYS} dias`);
  }

  private async activePlanFor(userId: string, planId: string, slotIn: Slot | undefined) {
    const plan = await this.owned(userId, planId);
    if (plan.archivedAt) throw new ConflictException('Este item está arquivado');
    const slot = slotIn ?? (plan.slots.length === 1 ? plan.slots[0] : 'ANY');
    if (!plan.slots.includes(slot)) throw new BadRequestException('Horário não previsto neste item');
    return { plan, slot };
  }

  private async createLog(userId: string, data: Prisma.IntakeLogUncheckedCreateInput) {
    try {
      return serializeLog(await this.prisma.intakeLog.create({ data }));
    } catch (err) {
      // Duas doses iguais no mesmo dia e horário: o segundo toque bate na chave única
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Esta dose já foi registrada');
      throw err;
    }
  }

  async log(userId: string, dto: LogDto) {
    this.assertLogDate(dto.date);
    const { plan, slot } = await this.activePlanFor(userId, dto.planId, dto.slot);
    if (dto.site && plan.administration !== 'INJECTION') throw new BadRequestException('O local só vale para injetáveis');
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : new Date();
    if (Number.isNaN(takenAt.getTime())) throw new BadRequestException('Horário inválido');
    return this.createLog(userId, {
      userId,
      planId: plan.id,
      date: parseDay(dto.date),
      slot,
      status: 'TAKEN',
      takenAt,
      // Snapshot da dose da época (a do plano, ou a informada só para este registro)
      doseAmount: dto.doseAmount ?? plan.doseAmount,
      doseUnit: plan.doseUnit,
      doseUnitLabel: plan.doseUnitLabel,
      site: dto.site ?? null,
      note: dto.note?.trim() || null,
    });
  }

  async skip(userId: string, dto: SkipDto) {
    this.assertLogDate(dto.date);
    const { plan, slot } = await this.activePlanFor(userId, dto.planId, dto.slot);
    return this.createLog(userId, {
      userId,
      planId: plan.id,
      date: parseDay(dto.date),
      slot,
      status: 'SKIPPED',
      takenAt: null,
      doseAmount: plan.doseAmount,
      doseUnit: plan.doseUnit,
      doseUnitLabel: plan.doseUnitLabel,
    });
  }

  async updateLog(userId: string, id: string, dto: UpdateLogDto) {
    const existing = await this.prisma.intakeLog.findFirst({ where: { id, userId }, include: { plan: { select: { administration: true } } } });
    if (!existing) throw new NotFoundException('Registro não encontrado');
    if (dto.site && existing.plan.administration !== 'INJECTION') throw new BadRequestException('O local só vale para injetáveis');
    const takenAt = dto.takenAt ? new Date(dto.takenAt) : undefined;
    if (takenAt && Number.isNaN(takenAt.getTime())) throw new BadRequestException('Horário inválido');
    const log = await this.prisma.intakeLog.update({
      where: { id },
      data: {
        ...(dto.site !== undefined ? { site: dto.site } : {}),
        ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        ...(dto.doseAmount !== undefined ? { doseAmount: dto.doseAmount } : {}),
        ...(takenAt ? { takenAt } : {}),
      },
    });
    return serializeLog(log);
  }

  /** Serve também de "Desfazer" do toast de registro. */
  async deleteLog(userId: string, id: string) {
    const { count } = await this.prisma.intakeLog.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Registro não encontrado');
  }

  async history(userId: string, { planId, from, to }: HistoryQueryDto) {
    rangeDays(from, to);
    if (planId) await this.owned(userId, planId);
    const logs = await this.prisma.intakeLog.findMany({
      where: { userId, ...(planId ? { planId } : {}), date: { gte: parseDay(from), lte: parseDay(to) } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    return { from, to, logs: logs.map(serializeLog) };
  }

  /** Só dos planos com "Mostrar marcador no gráfico de peso" e só registros TAKEN. */
  async weightMarkers(userId: string, { from, to }: RangeQueryDto) {
    rangeDays(from, to);
    const rows = await this.prisma.intakeLog.findMany({
      where: { userId, status: 'TAKEN', date: { gte: parseDay(from), lte: parseDay(to) }, plan: { showOnWeightChart: true } },
      select: { date: true, planId: true, plan: { select: { name: true } } },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => ({ date: formatDay(r.date), planId: r.planId, label: r.plan.name }));
  }

  // --- calendário ---------------------------------------------------------------

  async calendar(userId: string, id: string, q: CalendarQueryDto) {
    const plan = await this.owned(userId, id);
    const s = schedule(plan);
    return buildIcs(
      {
        id: plan.id,
        name: plan.name,
        scheduleType: plan.scheduleType,
        weekdays: plan.weekdays,
        intervalDays: plan.intervalDays,
        startDate: s.startDate,
        endDate: s.endDate,
        doseAmount: plan.doseAmount,
        doseUnit: plan.doseUnit,
        doseUnitLabel: plan.doseUnitLabel,
      },
      { time: q.time, title: q.title ?? 'generic', includeDose: q.dose === '1' },
    );
  }
}

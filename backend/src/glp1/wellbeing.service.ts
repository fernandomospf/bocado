import { BadRequestException, Injectable } from '@nestjs/common';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { addDays, dayNumber } from '../weight/weight.math';
import type { PutWellbeingDto } from './dto/glp1.dto';

const MAX_RANGE_DAYS = 92;

export interface WellbeingDay {
  date: string;
  nausea: number | null;
  appetite: number | null;
  energy: number | null;
  gi: number | null;
  note: string | null;
}

const empty = (date: string): WellbeingDay => ({ date, nausea: null, appetite: null, energy: null, gi: null, note: null });

/**
 * Bem-estar do dia (privado): toda consulta é filtrada pelo userId da sessão. Nada daqui vai para a casa, o admin, a IA,
 * analytics nem logs.
 */
@Injectable()
export class WellbeingService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(row: { date: Date; nausea: number | null; appetite: number | null; energy: number | null; gi: number | null; note: string | null }): WellbeingDay {
    return { date: formatDay(row.date), nausea: row.nausea, appetite: row.appetite, energy: row.energy, gi: row.gi, note: row.note };
  }

  private checkDate(date: string) {
    if (Number.isNaN(parseDay(date).getTime())) throw new BadRequestException('Data inválida');
    if (date > latestAllowedDay()) throw new BadRequestException('Não dá para registrar em um dia futuro');
  }

  /**
   * "Dia N desde a última aplicação" do plano injetável (só com o módulo de suplementos ligado): o dia da aplicação é o
   * dia 1. Só informa; nenhuma sugestão de dose ou ciclo.
   */
  private async dayOfCycle(userId: string, date: string): Promise<number | null> {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { supplementsEnabled: true } });
    if (!profile?.supplementsEnabled) return null;
    const last = await this.prisma.intakeLog.findFirst({
      where: { userId, status: 'TAKEN', date: { lte: parseDay(date) }, plan: { administration: 'INJECTION', archivedAt: null } },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    return last ? dayNumber(date) - dayNumber(formatDay(last.date)) + 1 : null;
  }

  async get(userId: string, date: string) {
    this.checkDate(date);
    const row = await this.prisma.wellbeingLog.findUnique({ where: { userId_date: { userId, date: parseDay(date) } } });
    return { ...(row ? this.serialize(row) : empty(date)), dayOfCycle: await this.dayOfCycle(userId, date) };
  }

  /** Grava (ou atualiza) o dia. Sem nenhuma resposta e sem nota, o registro do dia é removido. */
  async put(userId: string, date: string, dto: PutWellbeingDto) {
    this.checkDate(date);
    const where = { userId_date: { userId, date: parseDay(date) } };
    const existing = await this.prisma.wellbeingLog.findUnique({ where });
    const pick = <K extends 'nausea' | 'appetite' | 'energy' | 'gi'>(k: K) => (dto[k] !== undefined ? dto[k] : (existing?.[k] ?? null)) ?? null;
    const data = {
      nausea: pick('nausea'),
      appetite: pick('appetite'),
      energy: pick('energy'),
      gi: pick('gi'),
      note: (dto.note !== undefined ? dto.note : (existing?.note ?? null))?.trim() || null,
    };
    const blank = data.nausea === null && data.appetite === null && data.energy === null && data.gi === null && data.note === null;
    if (blank) {
      await this.prisma.wellbeingLog.deleteMany({ where: { userId, date: parseDay(date) } });
      return { ...empty(date), dayOfCycle: await this.dayOfCycle(userId, date) };
    }
    const row = await this.prisma.wellbeingLog.upsert({
      where,
      create: { userId, date: parseDay(date), ...data },
      update: data,
    });
    return { ...this.serialize(row), dayOfCycle: await this.dayOfCycle(userId, date) };
  }

  async range(userId: string, from: string, to: string): Promise<{ days: WellbeingDay[] }> {
    if (from > to || addDays(from, MAX_RANGE_DAYS) < to) throw new BadRequestException('Período inválido');
    const rows = await this.prisma.wellbeingLog.findMany({
      where: { userId, date: { gte: parseDay(from), lte: parseDay(to) } },
      orderBy: { date: 'asc' },
    });
    return { days: rows.map((r) => this.serialize(r)) };
  }
}

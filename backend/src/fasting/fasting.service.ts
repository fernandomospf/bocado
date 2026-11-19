import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EndFastDto, StartFastDto, UpdateFastDto } from './dto/fasting.dto';

const HOUR_MS = 3_600_000;
/** O início pode ficar até 24 h no passado (a pessoa esqueceu de tocar em "Iniciar"). */
export const MAX_PAST_START_MS = 24 * HOUR_MS;
/** Folga para relógios do aparelho levemente adiantados. */
const CLOCK_SKEW_MS = 2 * 60_000;
/** Teto de sanidade para uma janela editada à mão. */
const MAX_SESSION_MS = 7 * 24 * HOUR_MS;

export const ACTIVE_MESSAGE = 'Já existe uma janela em andamento. Encerre a atual para começar outra.';

type Row = { id: string; startedAt: Date; endedAt: Date | null; targetHours: number; note: string | null };

export function serializeFast(r: Row) {
  return {
    id: r.id,
    startedAt: r.startedAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    targetHours: r.targetHours,
    note: r.note,
    durationMinutes: r.endedAt ? Math.max(0, Math.round((r.endedAt.getTime() - r.startedAt.getTime()) / 60_000)) : null,
  };
}

/**
 * Janelas de jejum (privado): toda consulta é filtrada pelo userId da sessão. O servidor só guarda horários em UTC;
 * não calcula "quebra de jejum", sequência nem cobrança. Encerrar antes da meta é normal.
 */
@Injectable()
export class FastingService {
  constructor(private readonly prisma: PrismaService) {}

  private parse(value: string, message: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new BadRequestException(message);
    return d;
  }

  /** Dois pedidos ao mesmo tempo: o índice único parcial do banco recusa o segundo. */
  private conflict(err: unknown): never {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException(ACTIVE_MESSAGE);
    throw err;
  }

  async current(userId: string) {
    const row = await this.prisma.fastingSession.findFirst({ where: { userId, endedAt: null } });
    return row ? serializeFast(row) : null;
  }

  async start(userId: string, dto: StartFastDto, now = new Date()) {
    const startedAt = dto.startedAt ? this.parse(dto.startedAt, 'Horário de início inválido') : now;
    if (startedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new BadRequestException('O início não pode ser no futuro');
    if (startedAt.getTime() < now.getTime() - MAX_PAST_START_MS) throw new BadRequestException('O início pode ser de até 24 horas atrás');
    if (await this.prisma.fastingSession.findFirst({ where: { userId, endedAt: null }, select: { id: true } })) {
      throw new ConflictException(ACTIVE_MESSAGE);
    }
    try {
      const row = await this.prisma.fastingSession.create({ data: { userId, startedAt, targetHours: dto.targetHours } });
      return serializeFast(row);
    } catch (err) {
      return this.conflict(err);
    }
  }

  private async own(userId: string, id: string) {
    const row = await this.prisma.fastingSession.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException('Janela não encontrada');
    return row;
  }

  async end(userId: string, id: string, dto: EndFastDto, now = new Date()) {
    const row = await this.own(userId, id);
    if (row.endedAt) throw new ConflictException('Essa janela já foi encerrada.');
    const endedAt = dto.endedAt ? this.parse(dto.endedAt, 'Horário de término inválido') : now;
    if (endedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new BadRequestException('O término não pode ser no futuro');
    if (endedAt.getTime() <= row.startedAt.getTime()) throw new BadRequestException('O término precisa ser depois do início');
    const updated = await this.prisma.fastingSession.update({ where: { id }, data: { endedAt } });
    return serializeFast(updated);
  }

  async update(userId: string, id: string, dto: UpdateFastDto, now = new Date()) {
    const row = await this.own(userId, id);
    const startedAt = dto.startedAt ? this.parse(dto.startedAt, 'Horário de início inválido') : row.startedAt;
    const endedAt = dto.endedAt === undefined ? row.endedAt : dto.endedAt === null ? null : this.parse(dto.endedAt, 'Horário de término inválido');

    if (startedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new BadRequestException('O início não pode ser no futuro');
    // Sessão ativa: o início segue a regra das 24 h (editar o horário de quem esqueceu de iniciar)
    if (dto.startedAt && endedAt === null && startedAt.getTime() < now.getTime() - MAX_PAST_START_MS) {
      throw new BadRequestException('O início pode ser de até 24 horas atrás');
    }
    if (endedAt) {
      if (endedAt.getTime() > now.getTime() + CLOCK_SKEW_MS) throw new BadRequestException('O término não pode ser no futuro');
      if (endedAt.getTime() <= startedAt.getTime()) throw new BadRequestException('O término precisa ser depois do início');
      if (endedAt.getTime() - startedAt.getTime() > MAX_SESSION_MS) throw new BadRequestException('Janela longa demais para o registro');
    }
    if (endedAt === null && row.endedAt !== null && (await this.current(userId))) throw new ConflictException(ACTIVE_MESSAGE);

    try {
      const updated = await this.prisma.fastingSession.update({
        where: { id },
        data: {
          startedAt,
          endedAt,
          ...(dto.targetHours !== undefined ? { targetHours: dto.targetHours } : {}),
          ...(dto.note !== undefined ? { note: dto.note?.trim() || null } : {}),
        },
      });
      return serializeFast(updated);
    } catch (err) {
      return this.conflict(err);
    }
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.fastingSession.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Janela não encontrada');
  }

  async range(userId: string, from: string, to: string) {
    const start = this.parse(from, 'Data inicial inválida');
    const end = this.parse(to, 'Data final inválida');
    if (start > end || end.getTime() - start.getTime() > 93 * 24 * HOUR_MS) throw new BadRequestException('Período inválido');
    const rows = await this.prisma.fastingSession.findMany({
      where: { userId, startedAt: { gte: start, lte: end } },
      orderBy: { startedAt: 'desc' },
      take: 400,
    });
    return { sessions: rows.map(serializeFast) };
  }
}

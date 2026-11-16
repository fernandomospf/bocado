import { BadRequestException, ConflictException, GoneException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, Workout } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { latestAllowedDay, RESTORE_WINDOW_MS } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { dayNumber } from '../weight/weight.math';
import { WaterService } from '../water/water.service';
import { CreateWorkoutDto, RestoreWorkoutDto, UpdateWorkoutDto } from './dto/workout.dto';
import { estimateKcal } from './workout.math';

const MAX_RANGE_DAYS = 93;
const CLOCK_SKEW_MS = 60_000;

export interface WorkoutSnapshot {
  workout: { id: string; date: string; type: Workout['type']; durationMin: number; intensity: Workout['intensity']; note: string | null; createdAt: string };
  deletedAt: string;
}

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly water?: WaterService,
  ) {}

  /** Peso e preferências: a estimativa só aparece com `workoutEstimateEnabled`. */
  private async estimator(userId: string) {
    const p = await this.prisma.profile.findUnique({ where: { userId }, select: { weightKg: true, workoutEstimateEnabled: true, hideCalories: true } });
    return (w: Workout) => ({
      id: w.id,
      date: formatDay(w.date),
      type: w.type,
      durationMin: w.durationMin,
      intensity: w.intensity,
      note: w.note,
      createdAt: w.createdAt,
      ...(p?.workoutEstimateEnabled && !p.hideCalories ? { estimateKcal: estimateKcal(w, p.weightKg) } : {}),
    });
  }

  private assertNotFuture(date: string) {
    if (date > latestAllowedDay()) throw new BadRequestException('Não dá para registrar um treino em um dia futuro');
  }

  private async owned(userId: string, id: string) {
    const w = await this.prisma.workout.findFirst({ where: { id, userId } });
    if (!w) throw new NotFoundException('Treino não encontrado');
    return w;
  }

  async list(userId: string, from: string, to: string) {
    const days = dayNumber(to) - dayNumber(from);
    if (Number.isNaN(days) || days < 0) throw new BadRequestException('Intervalo inválido');
    if (days > MAX_RANGE_DAYS) throw new BadRequestException(`Intervalo máximo de ${MAX_RANGE_DAYS} dias`);
    const [rows, ser] = await Promise.all([
      this.prisma.workout.findMany({
        where: { userId, date: { gte: parseDay(from), lte: parseDay(to) } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      }),
      this.estimator(userId),
    ]);
    return { from, to, workouts: rows.map(ser) };
  }

  /** O último treino do usuário (para "repetir o último"), ou null. */
  async last(userId: string) {
    const [w, ser] = await Promise.all([
      this.prisma.workout.findFirst({ where: { userId }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      this.estimator(userId),
    ]);
    return w ? ser(w) : null;
  }

  async create(userId: string, dto: CreateWorkoutDto) {
    this.assertNotFuture(dto.date);
    const w = await this.prisma.workout.create({
      data: { userId, date: parseDay(dto.date), type: dto.type, durationMin: dto.durationMin, intensity: dto.intensity, note: dto.note?.trim() || null },
    });
    await this.water?.recalcAround(userId, dto.date); // a meta de água de hoje considera o treino
    return (await this.estimator(userId))(w);
  }

  async update(userId: string, id: string, dto: UpdateWorkoutDto) {
    const before = await this.owned(userId, id);
    if (dto.date) this.assertNotFuture(dto.date);
    const w = await this.prisma.workout.update({
      where: { id },
      data: {
        ...(dto.date ? { date: parseDay(dto.date) } : {}),
        ...(dto.type ? { type: dto.type } : {}),
        ...(dto.durationMin !== undefined ? { durationMin: dto.durationMin } : {}),
        ...(dto.intensity ? { intensity: dto.intensity } : {}),
        ...(dto.note !== undefined ? { note: dto.note.trim() || null } : {}),
      },
    });
    await this.water?.recalcAround(userId, formatDay(before.date));
    if (dto.date && dto.date !== formatDay(before.date)) await this.water?.recalcAround(userId, dto.date);
    return (await this.estimator(userId))(w);
  }

  /** Responde com o snapshot do que foi apagado, para o app oferecer "Desfazer". */
  async remove(userId: string, id: string): Promise<WorkoutSnapshot> {
    const w = await this.owned(userId, id);
    await this.prisma.workout.delete({ where: { id } });
    await this.water?.recalcAround(userId, formatDay(w.date));
    return {
      workout: { id: w.id, date: formatDay(w.date), type: w.type, durationMin: w.durationMin, intensity: w.intensity, note: w.note, createdAt: w.createdAt.toISOString() },
      deletedAt: new Date().toISOString(),
    };
  }

  /** Desfaz uma exclusão (até 10 minutos depois), com o MESMO id. O dono vem sempre da sessão, nunca do snapshot. */
  async restore(userId: string, dto: RestoreWorkoutDto) {
    const { workout, deletedAt } = dto.snapshot;
    const age = Date.now() - Date.parse(deletedAt);
    if (!Number.isFinite(age) || age < -CLOCK_SKEW_MS) throw new BadRequestException('Exclusão inválida');
    if (age > RESTORE_WINDOW_MS) throw new GoneException('Passou o tempo para desfazer esta exclusão');
    this.assertNotFuture(workout.date);
    try {
      const w = await this.prisma.workout.create({
        data: {
          id: workout.id,
          userId,
          date: parseDay(workout.date),
          type: workout.type,
          durationMin: workout.durationMin,
          intensity: workout.intensity,
          note: workout.note ?? null,
          createdAt: new Date(workout.createdAt),
        },
      });
      await this.water?.recalcAround(userId, workout.date);
      return (await this.estimator(userId))(w);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new ConflictException('Isso já foi restaurado');
      throw err;
    }
  }

  /** Copia o treino (sem a nota) para outra data. */
  async repeat(userId: string, id: string, date: string) {
    this.assertNotFuture(date);
    const src = await this.owned(userId, id);
    const w = await this.prisma.workout.create({
      data: { userId, date: parseDay(date), type: src.type, durationMin: src.durationMin, intensity: src.intensity },
    });
    await this.water?.recalcAround(userId, date);
    return (await this.estimator(userId))(w);
  }
}


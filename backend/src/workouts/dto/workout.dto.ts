import { WorkoutIntensity, WorkoutType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { ISO_DATE } from '../../common/dates';
import { MAX_DURATION_MIN, MIN_DURATION_MIN } from '../workout.math';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const DURATION = { min: `A duração mínima é de ${MIN_DURATION_MIN} minutos`, max: `A duração máxima é de ${MAX_DURATION_MIN} minutos` };

export class CreateWorkoutDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' })
  type: WorkoutType;

  @IsInt({ message: 'Informe a duração em minutos' })
  @Min(MIN_DURATION_MIN, { message: DURATION.min })
  @Max(MAX_DURATION_MIN, { message: DURATION.max })
  durationMin: number;

  @IsEnum(WorkoutIntensity, { message: 'Intensidade inválida' })
  intensity: WorkoutIntensity;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(trim)
  note?: string;
}

export class UpdateWorkoutDto {
  @IsOptional() @Matches(ISO_DATE, { message: 'Data inválida' })
  date?: string;

  @IsOptional() @IsEnum(WorkoutType, { message: 'Tipo de treino inválido' })
  type?: WorkoutType;

  @IsOptional()
  @IsInt({ message: 'Informe a duração em minutos' })
  @Min(MIN_DURATION_MIN, { message: DURATION.min })
  @Max(MAX_DURATION_MIN, { message: DURATION.max })
  durationMin?: number;

  @IsOptional() @IsEnum(WorkoutIntensity, { message: 'Intensidade inválida' })
  intensity?: WorkoutIntensity;

  /** Texto vazio apaga a nota. */
  @IsOptional() @IsString() @MaxLength(280) @Transform(trim)
  note?: string;
}

export class WorkoutRangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class RepeatWorkoutDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class SnapshotWorkoutDto {
  @IsUUID() id: string;
  @Matches(ISO_DATE) date: string;
  @IsEnum(WorkoutType) type: WorkoutType;
  @IsInt() @Min(MIN_DURATION_MIN) @Max(MAX_DURATION_MIN) durationMin: number;
  @IsEnum(WorkoutIntensity) intensity: WorkoutIntensity;
  @IsOptional() @IsString() @MaxLength(280) note?: string | null;
  @IsISO8601() createdAt: string;
}

/** O que foi apagado. Nunca traz userId: o dono é sempre o usuário da sessão. */
export class WorkoutSnapshotDto {
  @ValidateNested()
  @Type(() => SnapshotWorkoutDto)
  workout: SnapshotWorkoutDto;

  @IsISO8601()
  deletedAt: string;
}

export class RestoreWorkoutDto {
  @ValidateNested()
  @Type(() => WorkoutSnapshotDto)
  snapshot: WorkoutSnapshotDto;
}

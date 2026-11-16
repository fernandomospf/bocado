import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { WaitlistStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class WaitlistQueryDto {
  @IsOptional()
  @IsEnum(WaitlistStatus)
  status?: WaitlistStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  page?: number;
}

export class AiUsageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  days?: number;
}

export class AiLimitDto {
  /** Multiplicador dos limites: 0 bloqueia a IA para a pessoa, 2 dobra. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  factor: number;
}

export class CreateInviteDto {
  @IsString()
  @MinLength(1, { message: 'Informe para quem é o convite' })
  @MaxLength(80)
  @Transform(trim)
  label: string;

  @IsInt()
  @Min(1)
  @Max(50)
  maxUses: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  expiresInDays?: number;
}

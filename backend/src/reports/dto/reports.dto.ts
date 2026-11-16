import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

export class WeeklyQueryDto {
  /** Qualquer dia da semana desejada: o servidor normaliza para o primeiro dia. */
  @Matches(ISO_DATE, { message: 'Data da semana inválida' })
  week: string;
}

export class WeeklyListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class WeeklyPendingQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;
}

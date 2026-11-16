import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

export class AdaptiveStatusQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;
}

export class AdaptiveHistoryQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class ApplyAdaptiveDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;

  /** A meta que a pessoa viu na tela: se a sugestão mudou desde então, o servidor responde 409. */
  @IsInt()
  @Min(800)
  @Max(8000)
  expectedKcal: number;
}

export enum DismissAction {
  DISMISSED = 'DISMISSED',
  SNOOZED = 'SNOOZED',
}

export class DismissAdaptiveDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;

  /** "Manter a minha" = DISMISSED; "Lembrar em 2 semanas" = SNOOZED. */
  @IsOptional()
  @IsEnum(DismissAction)
  action?: DismissAction;

  @IsOptional()
  @IsInt()
  @Min(14, { message: 'A pausa mínima é de 14 dias' })
  @Max(60)
  snoozeDays?: number;
}

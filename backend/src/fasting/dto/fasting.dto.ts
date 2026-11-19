import { Transform } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** Mensagens de validação nunca repetem o que a pessoa digitou. */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export const MIN_TARGET_HOURS = 12;
export const MAX_TARGET_HOURS = 20;

export class IdParamDto {
  @IsUUID('all', { message: 'Sessão inválida' })
  id: string;
}

export class StartFastDto {
  @IsInt({ message: 'Informe as horas da janela' })
  @Min(MIN_TARGET_HOURS, { message: `A janela vai de ${MIN_TARGET_HOURS} a ${MAX_TARGET_HOURS} horas` })
  @Max(MAX_TARGET_HOURS, { message: `A janela vai de ${MIN_TARGET_HOURS} a ${MAX_TARGET_HOURS} horas` })
  targetHours: number;

  /** Início em UTC (ISO 8601), até 24 h no passado. Sem ele, começa agora. */
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Horário de início inválido' })
  startedAt?: string;
}

export class EndFastDto {
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Horário de término inválido' })
  endedAt?: string;
}

export class UpdateFastDto {
  @IsOptional()
  @IsInt({ message: 'Informe as horas da janela' })
  @Min(MIN_TARGET_HOURS, { message: `A janela vai de ${MIN_TARGET_HOURS} a ${MAX_TARGET_HOURS} horas` })
  @Max(MAX_TARGET_HOURS, { message: `A janela vai de ${MIN_TARGET_HOURS} a ${MAX_TARGET_HOURS} horas` })
  targetHours?: number;

  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'Horário de início inválido' })
  startedAt?: string;

  /** `null` reabre a sessão (volta a ficar ativa), se não houver outra ativa. */
  @ValidateIf((o: UpdateFastDto) => o.endedAt !== undefined && o.endedAt !== null)
  @IsISO8601({ strict: true }, { message: 'Horário de término inválido' })
  endedAt?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateFastDto) => o.note !== null)
  @IsString({ message: 'Nota inválida' })
  @Transform(trim)
  @MaxLength(280, { message: 'A nota pode ter até 280 caracteres' })
  note?: string | null;
}

export class FastRangeDto {
  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'Data inicial inválida' })
  from: string;

  @Matches(/^\d{4}-\d{2}-\d{2}/, { message: 'Data final inválida' })
  to: string;
}

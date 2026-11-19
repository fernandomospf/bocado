import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

/** Mensagens de validação nunca repetem o que a pessoa digitou (é dado de saúde). */
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DateParamDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class RangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class TodayQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;
}

const scale = (o: Record<string, unknown>, key: string) => o[key] !== undefined && o[key] !== null;

/** Cada escala vai de 0 a 3; `null` = não respondeu (apaga a resposta daquele dia). */
export class PutWellbeingDto {
  @ValidateIf((o: PutWellbeingDto) => scale(o as never, 'nausea'))
  @IsInt({ message: 'Resposta inválida' })
  @Min(0, { message: 'Resposta inválida' })
  @Max(3, { message: 'Resposta inválida' })
  nausea?: number | null;

  @ValidateIf((o: PutWellbeingDto) => scale(o as never, 'appetite'))
  @IsInt({ message: 'Resposta inválida' })
  @Min(0, { message: 'Resposta inválida' })
  @Max(3, { message: 'Resposta inválida' })
  appetite?: number | null;

  @ValidateIf((o: PutWellbeingDto) => scale(o as never, 'energy'))
  @IsInt({ message: 'Resposta inválida' })
  @Min(0, { message: 'Resposta inválida' })
  @Max(3, { message: 'Resposta inválida' })
  energy?: number | null;

  @ValidateIf((o: PutWellbeingDto) => scale(o as never, 'gi'))
  @IsInt({ message: 'Resposta inválida' })
  @Min(0, { message: 'Resposta inválida' })
  @Max(3, { message: 'Resposta inválida' })
  gi?: number | null;

  @IsOptional()
  @ValidateIf((o: PutWellbeingDto) => o.note !== null)
  @IsString({ message: 'Nota inválida' })
  @Transform(trim)
  @MaxLength(280, { message: 'A nota pode ter até 280 caracteres' })
  note?: string | null;
}

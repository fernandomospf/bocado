import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class WeightDateParamDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class WeightRangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class SaveWeightDto {
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Peso inválido (até 1 casa decimal)' })
  @Min(30, { message: 'Peso mínimo de 30 kg' })
  @Max(350, { message: 'Peso máximo de 350 kg' })
  weightKg: number;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  @Transform(trim)
  note?: string;
}

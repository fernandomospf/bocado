import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
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

/** Meta de peso: de 30 a 350 kg, 1 casa decimal. `null` remove a meta. */
export class SetWeightGoalDto {
  @ValidateIf((o: SetWeightGoalDto) => o.goalWeightKg !== null)
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Informe a meta com no máximo 1 casa decimal' })
  @Min(30, { message: 'A meta precisa ser de pelo menos 30 kg' })
  @Max(350, { message: 'A meta precisa ser de no máximo 350 kg' })
  goalWeightKg: number | null;
}

export const IMPORT_SOURCES = ['CSV', 'APPLE_HEALTH'] as const;
export const IMPORT_CONFLICTS = ['keep', 'replace'] as const;

export class ImportEntryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  // Os valores fora de 30 a 350 kg não derrubam o lote: o servidor os descarta e conta (ver normalizeImport)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Peso inválido' })
  weightKg: number;
}

/** Um lote de uma importação. Lotes seguintes mandam o `importId` devolvido pelo primeiro. */
export class ImportWeightDto {
  @IsIn(IMPORT_SOURCES, { message: 'Origem inválida' })
  source: (typeof IMPORT_SOURCES)[number];

  @IsIn(IMPORT_CONFLICTS, { message: 'Escolha manter ou substituir' })
  conflict: (typeof IMPORT_CONFLICTS)[number];

  @IsOptional()
  @IsUUID()
  importId?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Nenhum registro para importar' })
  @ArrayMaxSize(5000, { message: 'No máximo 5.000 registros por envio' })
  @ValidateNested({ each: true })
  @Type(() => ImportEntryDto)
  entries: ImportEntryDto[];
}

export class ImportIdParamDto {
  @IsUUID()
  id: string;
}

import { Transform, Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { BY_WEIGHT_MAX_GRAMS, BY_WEIGHT_MIN_GRAMS } from '../by-weight';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AnalyzeTextDto {
  @IsString()
  @MinLength(3, { message: 'Descreva o que você comeu' })
  @MaxLength(600)
  @Transform(trim)
  description: string;
}

export class AnalyzePhotoDto {
  /** Dica opcional do usuário: o que a foto não mostra (ex.: "arroz integral, sem óleo"). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  hint?: string;

  /** 'by_weight' = prato por quilo (exige totalGrams). Sem ele, a análise é a comum. */
  @IsOptional()
  @IsIn(['by_weight'], { message: 'Modo de análise inválido' })
  mode?: 'by_weight';

  /** Peso do prato na balança, sem o prato (multipart chega como texto). */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Informe o peso do prato em gramas' })
  @Min(BY_WEIGHT_MIN_GRAMS, { message: `O peso do prato precisa ser de pelo menos ${BY_WEIGHT_MIN_GRAMS} g` })
  @Max(BY_WEIGHT_MAX_GRAMS, { message: `O peso do prato pode ter no máximo ${BY_WEIGHT_MAX_GRAMS} g` })
  totalGrams?: number;
}

export class AnalyzeLabelDto {
  /** Código de barras lido antes (o produto será salvo com ele). */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Transform(trim)
  barcode?: string;
}

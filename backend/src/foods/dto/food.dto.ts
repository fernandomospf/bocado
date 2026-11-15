import { Transform, Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class SearchFoodsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class CreateFoodDto {
  @IsString()
  @MinLength(2, { message: 'Dê um nome ao alimento' })
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  category?: string;

  /** Valores por 100 g (gordura pura tem ~900 kcal/100 g). */
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(900)
  kcal100: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  protein100: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  carbs100: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  fat100: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5000)
  portionGrams?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(trim)
  portionLabel?: string;
}

export class Per100Dto {
  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Calorias inválidas' }) @Min(1, { message: 'Informe as calorias' }) @Max(900, { message: 'Calorias acima de 900 kcal por 100 g' })
  kcal: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  protein: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  carbs: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(100)
  fat: number;
}

export class ServingDto {
  @IsNumber({ maxDecimalPlaces: 1 }) @Min(1) @Max(5000)
  grams: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(trim)
  label?: string;
}

/** Produto lido do rótulo e revisado pela pessoa: vai para o acervo compartilhado (source LABEL). */
export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  barcode?: string;

  @IsString()
  @MinLength(2, { message: 'Dê um nome ao produto' })
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Transform(trim)
  brand?: string;

  @ValidateNested()
  @Type(() => Per100Dto)
  per100: Per100Dto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ServingDto)
  serving?: ServingDto;
}

export class ReportFoodDto {
  @IsString()
  @MinLength(3, { message: 'Conte em poucas palavras o que está errado' })
  @MaxLength(200)
  @Transform(trim)
  reason: string;
}

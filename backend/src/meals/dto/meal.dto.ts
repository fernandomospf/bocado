import { MealSource, MealType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ISO_DATE } from '../../common/dates';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class MealItemDto {
  @IsString()
  @MinLength(1, { message: 'Dê um nome ao alimento' })
  @MaxLength(120)
  @Transform(trim)
  name: string;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(5000)
  grams: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10000)
  kcal: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  protein: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  carbs: number;

  @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  fat: number;

  /** Veio da análise por IA e não foi editado antes de salvar (mostra o selo "estimativa"). */
  @IsOptional()
  @IsBoolean()
  estimated?: boolean;
}

export class CreateMealDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsEnum(MealType, { message: 'Selecione a refeição' })
  type: MealType;

  @IsOptional()
  @IsEnum(MealSource)
  source?: MealSource;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  @Transform(trim)
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione pelo menos um alimento' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items: MealItemDto[];
}

export class UpdateMealItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) @Transform(trim)
  name?: string;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(5000)
  grams?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(10000)
  kcal?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  protein?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  carbs?: number;

  @IsOptional() @IsNumber({ maxDecimalPlaces: 1 }) @Min(0) @Max(1000)
  fat?: number;
}

/** Mover um alimento para outra refeição e/ou outro dia. */
export class MoveMealItemDto {
  @IsEnum(MealType, { message: 'Selecione a refeição' })
  type: MealType;

  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class DayParamDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class RangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

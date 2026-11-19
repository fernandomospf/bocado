import { MealSource, MealType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
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

  /** Receita de origem (conta o uso). Ignorada se a receita não for visível ao usuário. */
  @IsOptional()
  @IsUUID()
  recipeId?: string;
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

// ---------------------------------------------------------------------------
// Desfazer exclusão: o DELETE devolve um snapshot e o app o reenvia para restaurar
// ---------------------------------------------------------------------------

export class SnapshotMealDto {
  @IsUUID()
  id: string;

  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsEnum(MealType)
  type: MealType;

  @IsEnum(MealSource)
  source: MealSource;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  note?: string | null;

  @IsISO8601()
  createdAt: string;
}

export class SnapshotItemDto extends MealItemDto {
  @IsUUID()
  id: string;
}

/** O que foi apagado. Nunca traz userId: o dono é sempre o usuário da sessão. */
export class MealSnapshotDto {
  @ValidateNested()
  @Type(() => SnapshotMealDto)
  meal: SnapshotMealDto;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SnapshotItemDto)
  items: SnapshotItemDto[];

  @IsBoolean()
  mealDeleted: boolean;

  @IsISO8601()
  deletedAt: string;
}

export class RestoreMealDto {
  @ValidateNested()
  @Type(() => MealSnapshotDto)
  snapshot: MealSnapshotDto;
}

/** Dia local de hoje da pessoa (o servidor não usa fuso). */
export class LastLogQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;
}

export class RecentQueryDto {
  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number;
}

export class RepeatMealDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;
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

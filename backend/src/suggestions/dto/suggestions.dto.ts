import { MealType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ISO_DATE } from '../../common/dates';
import { MealItemDto } from '../../meals/dto/meal.dto';

/** O servidor não sabe o horário local: o app diz se é jantar (até 21h) ou lanche/ceia (depois). */
export const SUGGESTION_MEALS = ['DINNER', 'SNACK'] as const;
export type SuggestionMeal = (typeof SUGGESTION_MEALS)[number];

export class CloseDayQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsOptional()
  @IsIn(SUGGESTION_MEALS)
  meal?: SuggestionMeal;
}

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** "O que tem em casa?": texto livre, interpretado sem IA. */
export class CloseDayPantryDto extends CloseDayQueryDto {
  @IsString()
  @MaxLength(300, { message: 'Texto muito longo (até 300 caracteres)' })
  @Transform(trim)
  text: string;
}

export class CloseDayAiDto extends CloseDayQueryDto {
  /** Ingredientes da despensa: a receita da IA usa só estes (mais temperos básicos). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  ingredients?: string[];
}

export class LogSuggestionDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsEnum(MealType, { message: 'Selecione a refeição' })
  type: MealType;

  @IsArray()
  @ArrayMinSize(1, { message: 'A sugestão precisa de pelo menos um alimento' })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items: MealItemDto[];
}

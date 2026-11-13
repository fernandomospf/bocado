import { MealType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsOptional, Matches, ValidateNested } from 'class-validator';
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

export class CloseDayAiDto extends CloseDayQueryDto {}

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

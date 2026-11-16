import { MealType } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateFavoriteDto {
  @IsUUID()
  fromMealId: string;

  /** Sem nome, usa os nomes dos 2 primeiros itens. */
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Dê um nome à favorita' })
  @MaxLength(60)
  @Transform(trim)
  name?: string;
}

export class RenameFavoriteDto {
  @IsString()
  @MinLength(1, { message: 'Dê um nome à favorita' })
  @MaxLength(60)
  @Transform(trim)
  name: string;
}

export class LogFavoriteDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsEnum(MealType, { message: 'Selecione a refeição' })
  type: MealType;
}

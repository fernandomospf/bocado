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
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ISO_DATE } from '../../common/dates';
import { MealItemDto } from './meal.dto';

export class ParticipantDto {
  @IsUUID()
  userId: string;

  /** Fração da refeição que fica com a pessoa (soma de todas = 1). */
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001, { message: 'Cada pessoa precisa ficar com uma parte' })
  @Max(1)
  share: number;
}

export class CreateSharedMealDto {
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
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  note?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Adicione pelo menos um alimento' })
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => MealItemDto)
  items: MealItemDto[];

  @IsArray()
  @ArrayMinSize(2, { message: 'Escolha pelo menos mais uma pessoa' })
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => ParticipantDto)
  participants: ParticipantDto[];
}

export class AcceptOfferDto {
  /** Mover a refeição para outro tipo (ex.: de jantar para lanche). */
  @IsOptional()
  @IsEnum(MealType)
  type?: MealType;

  /** Também liga "aceitar automaticamente refeições da casa". */
  @IsOptional()
  @IsBoolean()
  always?: boolean;
}

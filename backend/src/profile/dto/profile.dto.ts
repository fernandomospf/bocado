import { ActivityLevel, GoalType, Sex } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ISO_DATE } from '../../common/dates';

export class TargetsDto {
  @IsInt() @Min(800, { message: 'Meta de calorias muito baixa (mín. 800 kcal)' }) @Max(8000)
  kcal: number;

  @IsInt() @Min(0) @Max(500)
  protein: number;

  @IsInt() @Min(0) @Max(1500)
  carbs: number;

  @IsInt() @Min(0) @Max(400)
  fat: number;
}

export class BodyDataDto {
  @IsEnum(Sex, { message: 'Selecione o sexo' })
  sex: Sex;

  @Matches(ISO_DATE, { message: 'Data de nascimento inválida' })
  birthDate: string;

  @IsInt({ message: 'Altura deve ser em centímetros' })
  @Min(100, { message: 'Altura mínima de 100 cm' })
  @Max(250, { message: 'Altura máxima de 250 cm' })
  heightCm: number;

  @IsNumber({ maxDecimalPlaces: 1 }, { message: 'Peso inválido' })
  @Min(30, { message: 'Peso mínimo de 30 kg' })
  @Max(350, { message: 'Peso máximo de 350 kg' })
  weightKg: number;

  @IsEnum(ActivityLevel, { message: 'Selecione o nível de atividade' })
  activityLevel: ActivityLevel;

  @IsEnum(GoalType, { message: 'Selecione um objetivo' })
  goal: GoalType;
}

export class SaveProfileDto extends BodyDataDto {
  /** Metas definidas manualmente na etapa final do questionário (opcional). */
  @IsOptional()
  @ValidateNested()
  @Type(() => TargetsDto)
  targets?: TargetsDto;
}

import { ActivityLevel, GoalType, Sex, WaterGoalMode, WeekStart } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDivisibleBy,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateIf,
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

/** Preferências de exibição (não afetam o cálculo das metas). */
export class PreferencesDto {
  @IsOptional()
  @IsEnum(WeekStart, { message: 'Escolha segunda ou domingo' })
  weekStartsOn?: WeekStart;

  @IsOptional()
  @IsBoolean()
  hideWeightInReports?: boolean;

  // Opcional, mas `null` NÃO vale (IsOptional deixaria passar e a coluna não aceita nulo)
  @ValidateIf((o: PreferencesDto) => o.hideCalories !== undefined)
  @IsBoolean()
  hideCalories?: boolean;

  @IsOptional()
  @IsBoolean()
  adaptiveEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  workoutEstimateEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  workoutAddToGoal?: boolean;

  /** Contador de água: ligar/desligar (null não vale). */
  @ValidateIf((o: PreferencesDto) => o.waterEnabled !== undefined)
  @IsBoolean()
  waterEnabled?: boolean;

  @ValidateIf((o: PreferencesDto) => o.waterGoalMode !== undefined)
  @IsEnum(WaterGoalMode, { message: 'Escolha automática ou manual' })
  waterGoalMode?: WaterGoalMode;

  /** Meta manual em ml (1000 a 5000); null limpa. */
  @ValidateIf((o: PreferencesDto) => o.waterGoalManualMl !== undefined && o.waterGoalManualMl !== null)
  @IsInt({ message: 'Informe a meta de água em ml' })
  @Min(1000, { message: 'A meta de água precisa ser de pelo menos 1.000 ml' })
  @Max(5000, { message: 'A meta de água pode ter no máximo 5.000 ml' })
  waterGoalManualMl?: number | null;

  /** Tamanho da garrafa em ml (100 a 2000); null limpa. */
  @ValidateIf((o: PreferencesDto) => o.waterBottleMl !== undefined && o.waterBottleMl !== null)
  @IsInt({ message: 'Informe o tamanho da garrafa em ml' })
  @Min(100, { message: 'A garrafa precisa ter pelo menos 100 ml' })
  @Max(2000, { message: 'A garrafa pode ter no máximo 2.000 ml' })
  waterBottleMl?: number | null;

  /** Medidor de movimento: ligar/desligar (null não vale). */
  @ValidateIf((o: PreferencesDto) => o.movementEnabled !== undefined)
  @IsBoolean()
  movementEnabled?: boolean;

  /** Meta DIÁRIA em minutos (15 a 240, múltiplo de 5); null limpa (só os minutos, sem meta). */
  @ValidateIf((o: PreferencesDto) => o.movementDailyGoalMin !== undefined && o.movementDailyGoalMin !== null)
  @IsInt({ message: 'Informe a meta diária de movimento em minutos' })
  @IsDivisibleBy(5, { message: 'A meta diária de movimento deve ser um múltiplo de 5 minutos' })
  @Min(15, { message: 'A meta diária de movimento precisa ser de pelo menos 15 minutos' })
  @Max(240, { message: 'A meta diária de movimento pode ter no máximo 240 minutos' })
  movementDailyGoalMin?: number | null;

  /** Dias de descanso (0 = domingo … 6 = sábado), sem repetidos; [] = nenhum. null não vale. */
  @ValidateIf((o: PreferencesDto) => o.movementRestDays !== undefined)
  @IsArray({ message: 'Escolha os dias de descanso' })
  @ArrayMaxSize(7)
  @ArrayUnique({ message: 'Dia de descanso repetido' })
  @IsInt({ each: true, message: 'Dia de descanso inválido' })
  @Min(0, { each: true, message: 'Dia de descanso inválido' })
  @Max(6, { each: true, message: 'Dia de descanso inválido' })
  movementRestDays?: number[];

  /** Registro de suplementos e medicações (null não vale). Menores de 18 anos não podem ligar. */
  @ValidateIf((o: PreferencesDto) => o.supplementsEnabled !== undefined)
  @IsBoolean()
  supplementsEnabled?: boolean;

  /** Na tela Hoje, mostra nomes genéricos em vez do nome (null não vale). */
  @ValidateIf((o: PreferencesDto) => o.supplementsMaskNamesOnHome !== undefined)
  @IsBoolean()
  supplementsMaskNamesOnHome?: boolean;

  /** Acessibilidade (null não vale): alto contraste, menos transparência e menos animação. */
  @ValidateIf((o: PreferencesDto) => o.a11yHighContrast !== undefined)
  @IsBoolean()
  a11yHighContrast?: boolean;

  @ValidateIf((o: PreferencesDto) => o.a11yReduceTransparency !== undefined)
  @IsBoolean()
  a11yReduceTransparency?: boolean;

  @ValidateIf((o: PreferencesDto) => o.a11yReduceMotion !== undefined)
  @IsBoolean()
  a11yReduceMotion?: boolean;

  /** Jejum intermitente (null não vale). Menores de 18 anos não podem ligar (403). */
  @ValidateIf((o: PreferencesDto) => o.fastingEnabled !== undefined)
  @IsBoolean()
  fastingEnabled?: boolean;

  /** Modo GLP-1 (null não vale). Menores de 18 anos não podem ligar (403). */
  @ValidateIf((o: PreferencesDto) => o.glp1Mode !== undefined)
  @IsBoolean()
  glp1Mode?: boolean;

  /** Piso de proteína em g/dia (30 a 300); null volta a usar a sugestão. */
  @ValidateIf((o: PreferencesDto) => o.proteinFloorG !== undefined && o.proteinFloorG !== null)
  @IsInt({ message: 'Informe o piso de proteína em gramas' })
  @Min(30, { message: 'O piso de proteína precisa ser de pelo menos 30 g' })
  @Max(300, { message: 'O piso de proteína pode ter no máximo 300 g' })
  proteinFloorG?: number | null;
}

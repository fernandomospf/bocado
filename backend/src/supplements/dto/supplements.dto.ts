import { Administration, DoseUnit, InjectionSite, ScheduleType, Slot, SupplementCategory } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ISO_DATE } from '../../common/dates';

/**
 * As mensagens de validação NUNCA repetem o valor digitado (nome, dose, notas): são dados de saúde.
 * A dose só precisa ser um número positivo até 100000: o app não valida faixa nem converte unidade.
 */

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const present = (v: unknown) => v !== undefined && v !== null;

export const MAX_DOSE = 100_000;

export class CreatePlanDto {
  @IsString({ message: 'Informe o nome' })
  @Transform(trim)
  @MinLength(1, { message: 'Informe o nome' })
  @MaxLength(60, { message: 'O nome pode ter até 60 caracteres' })
  name: string;

  @IsEnum(SupplementCategory, { message: 'Categoria inválida' })
  category: SupplementCategory;

  @IsOptional()
  @IsEnum(Administration, { message: 'Forma de administração inválida' })
  administration?: Administration;

  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Informe a dose' })
  @IsPositive({ message: 'A dose precisa ser maior que zero' })
  @Max(MAX_DOSE, { message: 'Dose acima do limite do registro' })
  doseAmount: number;

  @IsEnum(DoseUnit, { message: 'Unidade inválida' })
  doseUnit: DoseUnit;

  /** Texto livre da unidade; obrigatório com "Outro". */
  @ValidateIf((o: CreatePlanDto) => o.doseUnit === 'OTHER')
  @IsString({ message: 'Informe a unidade' })
  @Transform(trim)
  @MinLength(1, { message: 'Informe a unidade' })
  @MaxLength(20, { message: 'A unidade pode ter até 20 caracteres' })
  doseUnitLabel?: string | null;

  @IsEnum(ScheduleType, { message: 'Frequência inválida' })
  scheduleType: ScheduleType;

  /** 0 = domingo … 6 = sábado; obrigatório em "Dias da semana". */
  @ValidateIf((o: CreatePlanDto) => o.scheduleType === 'WEEKDAYS')
  @IsArray({ message: 'Escolha os dias da semana' })
  @ArrayMinSize(1, { message: 'Escolha ao menos um dia da semana' })
  @ArrayMaxSize(7)
  @ArrayUnique({ message: 'Dia repetido' })
  @IsInt({ each: true, message: 'Dia inválido' })
  @Min(0, { each: true, message: 'Dia inválido' })
  @Max(6, { each: true, message: 'Dia inválido' })
  weekdays?: number[];

  /** 2 a 90; obrigatório em "A cada N dias". */
  @ValidateIf((o: CreatePlanDto) => o.scheduleType === 'EVERY_N_DAYS')
  @IsInt({ message: 'Informe o intervalo em dias' })
  @Min(2, { message: 'O intervalo mínimo é de 2 dias' })
  @Max(90, { message: 'O intervalo máximo é de 90 dias' })
  intervalDays?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique({ message: 'Horário repetido' })
  @IsEnum(Slot, { each: true, message: 'Horário inválido' })
  slots?: Slot[];

  @Matches(ISO_DATE, { message: 'Data de início inválida' })
  startDate: string;

  @ValidateIf((o: CreatePlanDto) => present(o.endDate))
  @Matches(ISO_DATE, { message: 'Data de fim inválida' })
  endDate?: string | null;

  @ValidateIf((o: CreatePlanDto) => present(o.notes))
  @IsString()
  @Transform(trim)
  @MaxLength(280, { message: 'As notas podem ter até 280 caracteres' })
  notes?: string | null;

  /** Só vale com administração injetável (o servidor ignora nos demais). */
  @IsOptional()
  @IsBoolean()
  trackSite?: boolean;

  @IsOptional()
  @IsBoolean()
  showOnWeightChart?: boolean;
}

/** Edição parcial: os campos que dependem uns dos outros (unidade "Outro", dias, intervalo) são conferidos no serviço, com o plano já mesclado. */
export class UpdatePlanDto {
  @IsOptional() @IsString({ message: 'Informe o nome' }) @Transform(trim) @MinLength(1, { message: 'Informe o nome' }) @MaxLength(60, { message: 'O nome pode ter até 60 caracteres' })
  name?: string;

  @IsOptional() @IsEnum(SupplementCategory, { message: 'Categoria inválida' })
  category?: SupplementCategory;

  @IsOptional() @IsEnum(Administration, { message: 'Forma de administração inválida' })
  administration?: Administration;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Informe a dose' })
  @IsPositive({ message: 'A dose precisa ser maior que zero' })
  @Max(MAX_DOSE, { message: 'Dose acima do limite do registro' })
  doseAmount?: number;

  @IsOptional() @IsEnum(DoseUnit, { message: 'Unidade inválida' })
  doseUnit?: DoseUnit;

  @ValidateIf((o: UpdatePlanDto) => present(o.doseUnitLabel))
  @IsString({ message: 'Informe a unidade' }) @Transform(trim) @MaxLength(20, { message: 'A unidade pode ter até 20 caracteres' })
  doseUnitLabel?: string | null;

  @IsOptional() @IsEnum(ScheduleType, { message: 'Frequência inválida' })
  scheduleType?: ScheduleType;

  @IsOptional()
  @IsArray({ message: 'Escolha os dias da semana' })
  @ArrayMaxSize(7)
  @ArrayUnique({ message: 'Dia repetido' })
  @IsInt({ each: true, message: 'Dia inválido' })
  @Min(0, { each: true, message: 'Dia inválido' })
  @Max(6, { each: true, message: 'Dia inválido' })
  weekdays?: number[];

  @ValidateIf((o: UpdatePlanDto) => present(o.intervalDays))
  @IsInt({ message: 'Informe o intervalo em dias' })
  @Min(2, { message: 'O intervalo mínimo é de 2 dias' })
  @Max(90, { message: 'O intervalo máximo é de 90 dias' })
  intervalDays?: number | null;

  @IsOptional() @IsArray() @ArrayMaxSize(4) @ArrayUnique({ message: 'Horário repetido' }) @IsEnum(Slot, { each: true, message: 'Horário inválido' })
  slots?: Slot[];

  @IsOptional() @Matches(ISO_DATE, { message: 'Data de início inválida' })
  startDate?: string;

  @ValidateIf((o: UpdatePlanDto) => present(o.endDate))
  @Matches(ISO_DATE, { message: 'Data de fim inválida' })
  endDate?: string | null;

  @ValidateIf((o: UpdatePlanDto) => present(o.notes))
  @IsString() @Transform(trim) @MaxLength(280, { message: 'As notas podem ter até 280 caracteres' })
  notes?: string | null;

  @IsOptional() @IsBoolean()
  trackSite?: boolean;

  @IsOptional() @IsBoolean()
  showOnWeightChart?: boolean;
}

export class DayQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class PlansQueryDto {
  /** "Hoje" do aparelho, para calcular a próxima dose (o servidor não conhece o fuso). */
  @IsOptional()
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today?: string;
}

export class LogDto {
  @IsUUID() planId: string;

  /** Dia local previsto da dose. */
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsOptional() @IsEnum(Slot, { message: 'Horário inválido' })
  slot?: Slot;

  @IsOptional() @IsEnum(InjectionSite, { message: 'Local inválido' })
  site?: InjectionSite;

  @ValidateIf((o: LogDto) => present(o.note))
  @IsString() @Transform(trim) @MaxLength(280, { message: 'A nota pode ter até 280 caracteres' })
  note?: string | null;

  /** Só neste registro; o padrão é a dose do plano. */
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Informe a dose' })
  @IsPositive({ message: 'A dose precisa ser maior que zero' })
  @Max(MAX_DOSE, { message: 'Dose acima do limite do registro' })
  doseAmount?: number;

  /** Quando foi tomada (ISO 8601); padrão: agora. */
  @IsOptional() @IsISO8601({}, { message: 'Horário inválido' })
  takenAt?: string;
}

export class SkipDto {
  @IsUUID() planId: string;

  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @IsOptional() @IsEnum(Slot, { message: 'Horário inválido' })
  slot?: Slot;
}

export class UpdateLogDto {
  @ValidateIf((o: UpdateLogDto) => present(o.site))
  @IsEnum(InjectionSite, { message: 'Local inválido' })
  site?: InjectionSite | null;

  @ValidateIf((o: UpdateLogDto) => present(o.note))
  @IsString() @Transform(trim) @MaxLength(280, { message: 'A nota pode ter até 280 caracteres' })
  note?: string | null;

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false }, { message: 'Informe a dose' })
  @IsPositive({ message: 'A dose precisa ser maior que zero' })
  @Max(MAX_DOSE, { message: 'Dose acima do limite do registro' })
  doseAmount?: number;

  @IsOptional() @IsISO8601({}, { message: 'Horário inválido' })
  takenAt?: string;
}

export class HistoryQueryDto {
  @IsOptional() @IsUUID()
  planId?: string;

  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class RangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class IdParamDto {
  @IsUUID()
  id: string;
}

export class CalendarQueryDto {
  /** Horário do lembrete, "HH:MM". */
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Horário inválido' })
  time: string;

  /** generic (padrão) = "Lembrete do Bocado"; name = o nome do plano. */
  @IsOptional() @IsEnum({ generic: 'generic', name: 'name' }, { message: 'Título inválido' })
  title?: 'generic' | 'name';

  /** Opt-in explícito (desligado): inclui a dose no título. "1" liga. */
  @IsOptional() @Matches(/^[01]$/, { message: 'Opção inválida' })
  dose?: '0' | '1';
}

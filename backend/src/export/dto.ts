import { IsIn, Matches } from 'class-validator';
import { ISO_DATE } from '../common/dates';
import { EXPORT_PERIODS, type ExportPeriod } from './period';

export class ExportQueryDto {
  @IsIn(Object.keys(EXPORT_PERIODS), { message: 'Período inválido' })
  period: ExportPeriod;

  /** "Hoje" no fuso do usuário. */
  @Matches(ISO_DATE, { message: 'Data inválida' })
  to: string;
}

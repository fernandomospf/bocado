import { Type } from 'class-transformer';
import { IsInt, Matches, Max, Min } from 'class-validator';
import { ISO_DATE } from '../../common/dates';
import { ENTRY_MAX_ML, ENTRY_MIN_ML } from '../water.math';

export class WaterDateQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;
}

export class WaterRangeQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;
}

export class WaterStreakQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;
}

export class AddWaterDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  date: string;

  @Type(() => Number)
  @IsInt({ message: 'Informe a quantidade em ml' })
  @Min(ENTRY_MIN_ML, { message: `O registro precisa ter pelo menos ${ENTRY_MIN_ML} ml` })
  @Max(ENTRY_MAX_ML, { message: `O registro pode ter no máximo ${ENTRY_MAX_ML} ml` })
  amountMl: number;
}

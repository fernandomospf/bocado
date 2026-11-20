import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { ISO_DATE } from '../../common/dates';

export class WeeklyQueryDto {
  /** Qualquer dia da semana desejada: o servidor normaliza para o primeiro dia. */
  @Matches(ISO_DATE, { message: 'Data da semana inválida' })
  week: string;
}

/** Relatório para o nutricionista: período de até 93 dias. */
export class NutritionistQueryDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;

  /** Inclui os alimentos de cada refeição (desligado por padrão). */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  foods?: boolean;

  /** Inclui o nome da pessoa no cabeçalho (ligado por padrão; "0"/"false" tira). */
  @IsOptional()
  @Transform(({ value }) => !(value === false || value === 'false' || value === '0'))
  @IsBoolean()
  name?: boolean;
}

export class WeeklyListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  limit?: number;
}

export class WeeklyPendingQueryDto {
  @Matches(ISO_DATE, { message: 'Data inválida' })
  today: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  hour: number;
}

/** Criar o link compartilhável: o código é SEMPRE gerado pelo servidor (não existe link sem código). */
export class CreateShareDto {
  @Matches(ISO_DATE, { message: 'Data inicial inválida' })
  from: string;

  @Matches(ISO_DATE, { message: 'Data final inválida' })
  to: string;

  @Type(() => Number)
  @IsInt()
  @IsIn([1, 7, 30], { message: 'Validade inválida' })
  expiresInDays: number;

  /** Aparelhos que podem abrir: 1 (padrão, o mais seguro) ou 2. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([1, 2], { message: 'Escolha 1 ou 2 aparelhos' })
  maxDevices?: number;
}

export class UnlockShareDto {
  @IsString()
  @MaxLength(20)
  code: string;
}

export class ShareIdParamDto {
  @IsUUID()
  id: string;
}

export class ShareTokenParamDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{20,64}$/, { message: 'Link inválido' })
  token: string;
}

import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class AnalyzeTextDto {
  @IsString()
  @MinLength(3, { message: 'Descreva o que você comeu' })
  @MaxLength(600)
  @Transform(trim)
  description: string;
}

export class AnalyzePhotoDto {
  /** Dica opcional do usuário: o que a foto não mostra (ex.: "arroz integral, sem óleo"). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(trim)
  hint?: string;
}

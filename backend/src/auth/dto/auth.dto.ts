import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @IsString()
  @MinLength(2, { message: 'Informe seu nome' })
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @MaxLength(160)
  @Transform(normalizeEmail)
  email: string;

  @IsString()
  @MinLength(8, { message: 'A senha precisa ter pelo menos 8 caracteres' })
  @MaxLength(128)
  password: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @Transform(normalizeEmail)
  email: string;

  @IsString()
  @MinLength(1, { message: 'Informe sua senha' })
  @MaxLength(128)
  password: string;
}

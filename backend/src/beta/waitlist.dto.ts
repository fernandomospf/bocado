import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const email = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

export class JoinWaitlistDto {
  @IsEmail({}, { message: 'Informe um e-mail válido' })
  @MaxLength(160)
  @Transform(email)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'O nome pode ter até 80 caracteres' })
  @Transform(trim)
  name?: string;

  @Equals(true, { message: 'Para entrar na lista, aceite receber o convite e a Política de Privacidade' })
  consent: boolean;

  /** Honeypot: campo invisível. Quem preenche é robô. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
}

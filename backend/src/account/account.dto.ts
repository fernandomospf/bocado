import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteAccountDto {
  @Equals('EXCLUIR', { message: 'Digite EXCLUIR para confirmar' })
  confirmation: string;

  /** Obrigatória para quem tem senha; contas só com Google não têm. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  password?: string;
}

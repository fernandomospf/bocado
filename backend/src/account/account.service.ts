import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { removeFromHousehold } from '../household/household.logic';
import { PrismaService } from '../prisma/prisma.service';
import { DeleteAccountDto } from './account.dto';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Exclusão definitiva (LGPD). Apaga o usuário e, pelos onDelete Cascade do schema, perfil, refeições e itens,
   * peso, receitas (inclusive as compartilhadas), alimentos CUSTOM, contadores de IA e denúncias.
   * Produtos do acervo que ele cadastrou continuam, sem autoria.
   */
  async deleteAccount(userId: string, dto: DeleteAccountDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) throw new UnauthorizedException();

    if (user.passwordHash) {
      if (!dto.password) throw new BadRequestException('Informe sua senha');
      if (!(await bcrypt.compare(dto.password, user.passwordHash))) throw new ForbiddenException('Senha incorreta');
    }

    await this.prisma.$transaction(async (tx) => {
      // Casa: mesma regra de "sair da casa" (OWNER passa ao membro mais antigo; casa vazia é apagada).
      // As receitas dele somem junto com a conta (onDelete Cascade), inclusive as compartilhadas.
      await removeFromHousehold(tx, userId);

      // Explícito, além do SetNull do schema: o acervo compartilhado não pode perder produtos
      await tx.food.updateMany({ where: { contributedById: userId }, data: { contributedById: null } });
      await tx.user.delete({ where: { id: userId } });
    });

    // Auditoria só com o id e a data (sem e-mail ou outro dado pessoal)
    this.logger.log(`Conta excluída: ${userId} em ${new Date().toISOString()}`);
  }
}

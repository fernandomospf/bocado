import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { BetaConfig } from '../beta/beta.config';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Só contas JÁ existentes cujo e-mail está em ADMIN_EMAILS. Roda depois do JwtAuthGuard global (que preenche req.user);
 * o e-mail vem do banco, não do token. Qualquer outra pessoa recebe 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beta: BetaConfig,
  ) {}

  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const id = req.user?.id;
    const admins = this.beta.adminEmails;
    if (!id || admins.size === 0) throw new ForbiddenException();
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user || !admins.has(user.email.trim().toLowerCase())) throw new ForbiddenException();
    return true;
  }
}

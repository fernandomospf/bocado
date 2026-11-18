import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ageFrom } from '../profile/nutrition';

export const UNDER_18_MESSAGE = 'Este recurso não está disponível para menores de 18 anos.';
export const NOT_ENABLED_MESSAGE = 'Este recurso não está ativado.';

/** Confere (sem expor nada sobre a pessoa) se o módulo pode ser usado: maior de 18 anos e ativado nas preferências. */
export async function assertSupplementsAccess(
  prisma: Pick<PrismaService, 'profile'>,
  userId: string,
  now = new Date(),
): Promise<void> {
  const p = await prisma.profile.findUnique({ where: { userId }, select: { supplementsEnabled: true, birthDate: true } });
  if (!p) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
  if (ageFrom(p.birthDate, now) < 18) throw new ForbiddenException(UNDER_18_MESSAGE);
  if (!p.supplementsEnabled) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
}

/** Toda rota do módulo exige `supplementsEnabled` e a idade mínima; o 403 é neutro e igual para qualquer dado. */
@Injectable()
export class SupplementsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
    await assertSupplementsAccess(this.prisma, user.id);
    return true;
  }
}

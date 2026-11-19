import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ageFrom } from '../profile/nutrition';

export const UNDER_18_MESSAGE = 'Este recurso não está disponível para menores de 18 anos.';
export const NOT_ENABLED_MESSAGE = 'Este recurso não está ativado.';

type Flags = 'glp1Mode' | 'supplementsEnabled' | 'fastingEnabled';

/**
 * 403 neutro (a mesma frase para qualquer dado): menor de 18 anos, ou nenhuma das preferências exigidas ligada.
 * `anyOf`: basta uma delas (bem-estar vale com GLP-1 OU suplementos).
 */
export async function assertHealthAccess(
  prisma: Pick<PrismaService, 'profile'>,
  userId: string,
  anyOf: Flags[],
  now = new Date(),
): Promise<void> {
  const p = await prisma.profile.findUnique({
    where: { userId },
    select: { birthDate: true, glp1Mode: true, supplementsEnabled: true, fastingEnabled: true },
  });
  if (!p) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
  if (ageFrom(p.birthDate, now) < 18) throw new ForbiddenException(UNDER_18_MESSAGE);
  if (!anyOf.some((f) => p[f])) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
}

@Injectable()
export class WellbeingGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
    await assertHealthAccess(this.prisma, user.id, ['glp1Mode', 'supplementsEnabled']);
    return true;
  }
}

@Injectable()
export class Glp1Guard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
    await assertHealthAccess(this.prisma, user.id, ['glp1Mode']);
    return true;
  }
}

/** Jejum: exige a preferência ligada e idade mínima (403 neutro). */
@Injectable()
export class FastingGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const user = ctx.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (!user) throw new ForbiddenException(NOT_ENABLED_MESSAGE);
    await assertHealthAccess(this.prisma, user.id, ['fastingEnabled']);
    return true;
  }
}

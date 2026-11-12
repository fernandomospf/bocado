import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.types';

/** Limita por usuário autenticado; cai para o IP em rotas públicas. */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request & { user?: AuthUser }): Promise<string> {
    return req.user?.id ?? req.ip ?? 'anon';
  }
}

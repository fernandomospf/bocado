import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { OAUTH_STATE_COOKIE } from '../auth.types';

function googleEnabled(config: ConfigService) {
  return Boolean(config.get('GOOGLE_CLIENT_ID') && config.get('GOOGLE_CLIENT_SECRET'));
}

/**
 * Inicia o fluxo OAuth. Gera um "state" aleatório guardado em cookie httpOnly
 * para proteger o callback contra CSRF.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!googleEnabled(this.config)) throw new NotFoundException('Login com Google não configurado');
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const res = context.switchToHttp().getResponse<Response>();
    const state = randomBytes(24).toString('hex');
    res.cookie(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE') !== 'false',
      sameSite: 'lax',
      path: '/api/auth/google',
      maxAge: 10 * 60 * 1000,
    });
    return { session: false, state, prompt: 'select_account' };
  }
}

/** Callback do Google: valida o "state" e redireciona para o login em caso de falha. */
@Injectable()
export class GoogleCallbackGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!googleEnabled(this.config)) throw new NotFoundException('Login com Google não configurado');

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const expected = req.cookies?.[OAUTH_STATE_COOKIE];
    const received = typeof req.query.state === 'string' ? req.query.state : '';
    res.clearCookie(OAUTH_STATE_COOKIE, { path: '/api/auth/google' });

    const valid =
      typeof expected === 'string' &&
      expected.length === received.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(received));
    if (!valid) throw new ForbiddenException('Sessão de login expirada. Tente novamente.');

    return super.canActivate(context);
  }

  getAuthenticateOptions() {
    return {
      session: false,
      failureRedirect: `${this.config.getOrThrow<string>('APP_URL')}/login?error=google`,
    };
  }
}

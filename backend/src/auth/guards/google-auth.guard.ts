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
import { normalizeBetaCode } from '../../beta/beta.service';
import { AuthService } from '../auth.service';
import { BETA_INVITE_COOKIE, OAUTH_STATE_COOKIE } from '../auth.types';

const INVITE_FORMAT = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/;

function googleEnabled(config: ConfigService) {
  return Boolean(config.get('GOOGLE_CLIENT_ID') && config.get('GOOGLE_CLIENT_SECRET'));
}

/**
 * Inicia o fluxo OAuth. Gera um "state" aleatório guardado em cookie httpOnly
 * para proteger o callback contra CSRF.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    if (!googleEnabled(this.config)) throw new NotFoundException('Login com Google não configurado');
    return super.canActivate(context);
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    // ?invite=CODE vira um cookie assinado de 10 minutos (o redirect do Google perde a query string)
    const invite = normalizeBetaCode(req.query.invite);
    const inviteCookie = { httpOnly: true, secure: this.config.get('COOKIE_SECURE') !== 'false', sameSite: 'lax' as const, path: '/api/auth/google' };
    if (INVITE_FORMAT.test(invite)) res.cookie(BETA_INVITE_COOKIE, this.auth.signInviteCookie(invite), { ...inviteCookie, maxAge: 10 * 60 * 1000 });
    else res.clearCookie(BETA_INVITE_COOKIE, { path: '/api/auth/google' });
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
    // O cookie do convite vale uma única passagem pelo callback (a leitura é feita antes, em req.cookies)
    res.clearCookie(BETA_INVITE_COOKIE, { path: '/api/auth/google' });

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

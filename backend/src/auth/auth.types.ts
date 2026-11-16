export interface AuthUser {
  id: string;
  email: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
}

export const AUTH_COOKIE = 'bocado_session';
export const OAUTH_STATE_COOKIE = 'bocado_oauth_state';
/** Convite do beta durante o login com Google (JWT assinado, 10 min, path /api/auth/google). */
export const BETA_INVITE_COOKIE = 'bocado_beta_invite';
export const SESSION_TTL_DAYS = 30;

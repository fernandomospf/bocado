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
export const SESSION_TTL_DAYS = 30;

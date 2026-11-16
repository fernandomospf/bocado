import { ForbiddenException } from '@nestjs/common';

/** Convite ausente, inexistente, expirado, revogado ou esgotado: a MESMA mensagem para todos os casos. */
export const INVITE_INVALID_MESSAGE = 'Convite inválido, expirado ou já utilizado.';
export const BETA_FULL_MESSAGE = 'As vagas do beta acabaram por enquanto. Entre na lista de espera.';

export class InviteInvalidError extends ForbiddenException {
  readonly reason = 'invite' as const;
  constructor() {
    super(INVITE_INVALID_MESSAGE);
  }
}

export class BetaFullError extends ForbiddenException {
  readonly reason = 'full' as const;
  constructor() {
    super(BETA_FULL_MESSAGE);
  }
}

export type BetaAccessError = InviteInvalidError | BetaFullError;
export const isBetaAccessError = (e: unknown): e is BetaAccessError => e instanceof InviteInvalidError || e instanceof BetaFullError;

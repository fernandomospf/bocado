import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RegistrationMode = 'open' | 'invite';

/** Leitura das variáveis do beta. Padrão: cadastro aberto, sem limite, ninguém é admin. */
@Injectable()
export class BetaConfig {
  constructor(private readonly config: ConfigService) {}

  get mode(): RegistrationMode {
    return this.config.get('REGISTRATION_MODE') === 'invite' ? 'invite' : 'open';
  }

  /** Limite de usuários do beta (null = sem limite). */
  get maxUsers(): number | null {
    const n = Number(this.config.get('BETA_MAX_USERS'));
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  get adminEmails(): Set<string> {
    return new Set(
      String(this.config.get('ADMIN_EMAILS') ?? '')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  get turnstileSecret(): string | null {
    return String(this.config.get('TURNSTILE_SECRET') ?? '').trim() || null;
  }

  get appUrl(): string {
    return this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '');
  }
}

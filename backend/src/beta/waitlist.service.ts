import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BetaConfig } from './beta.config';
import { JoinWaitlistDto } from './waitlist.dto';

const EMAIL_LIMIT = 3;
const EMAIL_WINDOW_MS = 3_600_000;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);
  /** Tentativas por e-mail na última hora (só em memória: nada de IP nem de log com e-mail). */
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly beta: BetaConfig,
  ) {}

  /** Sempre { ok: true } para e-mail novo, repetido ou robô (honeypot): nada revela quem já está na lista. */
  async join(dto: JoinWaitlistDto): Promise<{ ok: true }> {
    if (dto.website && dto.website.trim() !== '') return { ok: true }; // honeypot: finge sucesso e não grava

    await this.verifyTurnstile(dto.turnstileToken);
    this.takeEmailSlot(dto.email);

    try {
      await this.prisma.waitlistEntry.create({
        data: { email: dto.email, name: dto.name || null, consentAt: new Date() },
      });
    } catch (err) {
      // E-mail já na lista: mesma resposta, sem alterar nada
      if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
    }
    return { ok: true };
  }

  private takeEmailSlot(email: string) {
    const now = Date.now();
    const recent = (this.attempts.get(email) ?? []).filter((t) => now - t < EMAIL_WINDOW_MS);
    if (recent.length >= EMAIL_LIMIT) {
      throw new HttpException('Muitas tentativas com este e-mail. Tente de novo mais tarde.', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.attempts.set(email, recent);
    if (this.attempts.size > 5000) for (const [k, v] of this.attempts) if (!v.some((t) => now - t < EMAIL_WINDOW_MS)) this.attempts.delete(k);
  }

  /** Com TURNSTILE_SECRET, exige o token do Cloudflare (timeout de 5 s). Falhou ou deu erro = 400. */
  private async verifyTurnstile(token?: string) {
    const secret = this.beta.turnstileSecret;
    if (!secret) return;
    const fail = () => new BadRequestException('Não foi possível confirmar a verificação. Tente de novo.');
    if (!token) throw fail();
    try {
      const res = await fetch(TURNSTILE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      const data = (await res.json()) as { success?: boolean };
      if (data.success !== true) throw fail();
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      this.logger.warn('Falha ao consultar o Turnstile');
      throw fail();
    }
  }
}

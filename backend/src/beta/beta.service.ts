import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { generateInviteCode } from '../household/household.logic';
import { BetaConfig } from './beta.config';
import { BetaFullError, InviteInvalidError } from './beta.errors';

/** Chave do lock que serializa cadastros quando há limite de vagas. */
const SEATS_LOCK = 724_001;

export const normalizeBetaCode = (raw: unknown) => (typeof raw === 'string' ? raw.replace(/\s+/g, '').toUpperCase() : '');

@Injectable()
export class BetaService {
  constructor(
    private readonly prisma: PrismaService,
    readonly config: BetaConfig,
  ) {}

  async userCount() {
    return this.prisma.user.count();
  }

  /** Ainda há vaga para NOVOS cadastros? */
  async seatsOpen(): Promise<boolean> {
    const max = this.config.maxUsers;
    return max === null ? true : (await this.userCount()) < max;
  }

  /**
   * Cria um usuário novo respeitando o beta, tudo numa transação:
   * 1. limite de vagas (com lock, para dois cadastros ao mesmo tempo não furarem o limite);
   * 2. criação do usuário;
   * 3. em modo "invite", consumo ATÔMICO do convite (UPDATE ... WHERE uses < maxUses) e registro do uso.
   * Se qualquer passo falha, nada fica gravado (o convite não é consumido e o usuário não existe).
   * Em modo "open" o convite é ignorado.
   */
  async admitNewUser(createUser: (tx: Prisma.TransactionClient) => Promise<User>, inviteCode?: string | null): Promise<User> {
    const needsInvite = this.config.mode === 'invite';
    const code = normalizeBetaCode(inviteCode);
    if (needsInvite && !code) throw new InviteInvalidError();

    return this.prisma.$transaction(async (tx) => {
      const max = this.config.maxUsers;
      if (max !== null) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SEATS_LOCK})`;
        if ((await tx.user.count()) >= max) throw new BetaFullError();
      }
      const user = await createUser(tx);
      let inviteId: string | undefined;
      if (needsInvite) {
        inviteId = await this.consumeInvite(tx, code, user.id);
      }
      await tx.waitlistEntry.updateMany({
        where: { OR: [{ email: user.email }, ...(inviteId ? [{ inviteId }] : [])], status: { not: 'JOINED' } },
        data: { status: 'JOINED' },
      });
      return user;
    });
  }

  /** UPDATE atômico: só passa quem encontra o convite ativo e com uso sobrando. Qualquer falha dá o mesmo erro. */
  private async consumeInvite(tx: Prisma.TransactionClient, code: string, userId: string): Promise<string> {
    const rows = await tx.$queryRaw<{ id: string }[]>`
      UPDATE beta_invites
         SET uses = uses + 1
       WHERE code = ${code}
         AND "revokedAt" IS NULL
         AND ("expiresAt" IS NULL OR "expiresAt" > now())
         AND uses < "maxUses"
      RETURNING id::text AS id`;
    if (rows.length !== 1) throw new InviteInvalidError();
    await tx.betaInviteUse.create({ data: { inviteId: rows[0].id, userId } });
    return rows[0].id;
  }

  newCode() {
    return generateInviteCode();
  }
}

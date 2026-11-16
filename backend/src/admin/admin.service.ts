import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WaitlistStatus } from '@prisma/client';
import { BetaConfig } from '../beta/beta.config';
import { BetaService } from '../beta/beta.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/admin.dto';

export const PAGE_SIZE = 50;
export const WAITLIST_INVITE_DAYS = 14;
const DAY_MS = 86_400_000;

const activeInvite = (now = new Date()): Prisma.BetaInviteWhereInput => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
});

type InviteRow = { id: string; code: string; label: string; maxUses: number; uses: number; expiresAt: Date | null; revokedAt: Date | null; createdAt: Date };

function inviteStatus(i: Pick<InviteRow, 'maxUses' | 'uses' | 'expiresAt' | 'revokedAt'>, now = new Date()) {
  if (i.revokedAt) return 'revoked' as const;
  if (i.expiresAt && i.expiresAt <= now) return 'expired' as const;
  if (i.uses >= i.maxUses) return 'exhausted' as const;
  return 'active' as const;
}

const dateBr = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(d);

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beta: BetaService,
    private readonly config: BetaConfig,
  ) {}

  async stats() {
    const now = new Date();
    const [users, waitlistPending, activeRows, used] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.waitlistEntry.count({ where: { status: 'PENDING' } }),
      this.prisma.betaInvite.findMany({ where: activeInvite(now), select: { uses: true, maxUses: true } }),
      this.prisma.betaInviteUse.count(),
    ]);
    return {
      users,
      ...(this.config.maxUsers !== null ? { seatsLimit: this.config.maxUsers } : {}),
      waitlistPending,
      invitesActive: activeRows.filter((i) => i.uses < i.maxUses).length,
      invitesUsed: used,
    };
  }

  async waitlist(status: WaitlistStatus | undefined, page = 1) {
    const where: Prisma.WaitlistEntryWhereInput = status ? { status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.waitlistEntry.count({ where }),
      this.prisma.waitlistEntry.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { invite: { select: { id: true, code: true, expiresAt: true, revokedAt: true, uses: true, maxUses: true } } },
      }),
    ]);
    return {
      page,
      pageSize: PAGE_SIZE,
      total,
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        status: r.status,
        createdAt: r.createdAt,
        invitedAt: r.invitedAt,
        invite: r.invite ? { id: r.invite.id, code: r.invite.code, expiresAt: r.invite.expiresAt, status: inviteStatus(r.invite) } : null,
      })),
    };
  }

  /** Texto pronto para copiar. */
  private message(link: string, expiresAt: Date | null, name?: string | null) {
    const first = name?.trim().split(/\s+/)[0];
    const until = expiresAt ? ` Vale até ${dateBr(expiresAt)}.` : '';
    return `Oi${first ? `, ${first}` : ''}! Seu convite para o Bocado: ${link}.${until} Qualquer dúvida é só responder.`;
  }

  private link(code: string) {
    return `${this.config.appUrl}/register?invite=${code}`;
  }

  /** Cria (ou, se já houver um convite ativo para essa pessoa, devolve) o convite de uso único da entrada. */
  async inviteFromWaitlist(adminId: string, entryId: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId }, include: { invite: true } });
    if (!entry) throw new NotFoundException('Pessoa não encontrada na lista');

    if (entry.invite && inviteStatus(entry.invite) === 'active') {
      return this.invitePayload(entry.invite, entry.name);
    }
    const invite = await this.createWithUniqueCode({
      label: entry.email,
      maxUses: 1,
      expiresAt: new Date(Date.now() + WAITLIST_INVITE_DAYS * DAY_MS),
      createdById: adminId,
    });
    await this.prisma.waitlistEntry.update({
      where: { id: entry.id },
      data: { inviteId: invite.id, status: entry.status === 'JOINED' ? 'JOINED' : 'INVITED', invitedAt: new Date() },
    });
    return this.invitePayload(invite, entry.name);
  }

  private invitePayload(invite: InviteRow, name?: string | null) {
    const link = this.link(invite.code);
    return { id: invite.id, code: invite.code, link, expiresAt: invite.expiresAt, message: this.message(link, invite.expiresAt, name) };
  }

  /** Remoção a pedido da pessoa. Convite ainda não usado ligado a ela deixa de valer. */
  async removeFromWaitlist(entryId: string) {
    const entry = await this.prisma.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Pessoa não encontrada na lista');
    await this.prisma.$transaction(async (tx) => {
      if (entry.inviteId) {
        await tx.betaInvite.updateMany({ where: { id: entry.inviteId, uses: 0, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await tx.waitlistEntry.delete({ where: { id: entryId } });
    });
  }

  async invites() {
    const now = new Date();
    const rows = await this.prisma.betaInvite.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
    return rows.map((i) => ({
      id: i.id,
      code: i.code,
      label: i.label,
      maxUses: i.maxUses,
      uses: i.uses,
      expiresAt: i.expiresAt,
      revokedAt: i.revokedAt,
      createdAt: i.createdAt,
      status: inviteStatus(i, now),
      link: this.link(i.code),
    }));
  }

  async createInvite(adminId: string, dto: CreateInviteDto) {
    const invite = await this.createWithUniqueCode({
      label: dto.label,
      maxUses: dto.maxUses,
      expiresAt: dto.expiresInDays ? new Date(Date.now() + dto.expiresInDays * DAY_MS) : null,
      createdById: adminId,
    });
    return { ...this.invitePayload(invite), label: invite.label, maxUses: invite.maxUses };
  }

  async revokeInvite(inviteId: string) {
    const { count } = await this.prisma.betaInvite.updateMany({ where: { id: inviteId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (count === 0 && !(await this.prisma.betaInvite.findUnique({ where: { id: inviteId }, select: { id: true } }))) {
      throw new NotFoundException('Convite não encontrado');
    }
    return { ok: true };
  }

  private async createWithUniqueCode(data: Omit<Prisma.BetaInviteUncheckedCreateInput, 'code'>) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.betaInvite.create({ data: { ...data, code: this.beta.newCode() } });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new Error('Não foi possível gerar um código único');
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateInviteCode,
  INVITE_TTL_MS,
  MAX_ACTIVE_INVITES,
  MAX_MEMBERS,
  removeFromHousehold,
} from './household.logic';

const notFoundInvite = () => new NotFoundException('Convite inválido ou expirado');

@Injectable()
export class HouseholdService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * A casa do usuário e quem está nela. Os membros só expõem id, nome, foto e papel:
   * nunca e-mail, diário, metas ou peso.
   */
  async get(userId: string) {
    const me = await this.prisma.householdMember.findUnique({
      where: { userId },
      include: {
        household: {
          include: {
            members: {
              orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
              include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            },
          },
        },
      },
    });
    if (!me) return null;
    return {
      id: me.household.id,
      name: me.household.name,
      maxMembers: MAX_MEMBERS,
      me: { role: me.role, autoAcceptShared: me.autoAcceptShared },
      members: me.household.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
      })),
    };
  }

  async create(userId: string, name: string) {
    try {
      await this.prisma.household.create({
        data: { name, members: { create: { userId, role: 'OWNER' } } },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já está em uma casa');
      }
      throw err;
    }
    return this.get(userId);
  }

  async rename(userId: string, name: string) {
    const me = await this.requireOwner(userId);
    await this.prisma.household.update({ where: { id: me.householdId }, data: { name } });
    return this.get(userId);
  }

  // ---- Convites ------------------------------------------------------------

  private inviteView(i: { id: string; code: string; expiresAt: Date; createdAt: Date }) {
    return {
      id: i.id,
      code: i.code,
      link: `${this.config.getOrThrow<string>('APP_URL').replace(/\/$/, '')}/convite/${i.code}`,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
    };
  }

  private activeInvites(householdId: string) {
    return { householdId, usedAt: null, expiresAt: { gt: new Date() } };
  }

  async listInvites(userId: string) {
    const me = await this.requireOwner(userId);
    const rows = await this.prisma.householdInvite.findMany({
      where: this.activeInvites(me.householdId),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((i) => this.inviteView(i));
  }

  async createInvite(userId: string) {
    const me = await this.requireOwner(userId);
    const active = await this.prisma.householdInvite.count({ where: this.activeInvites(me.householdId) });
    if (active >= MAX_ACTIVE_INVITES) {
      throw new ConflictException(`No máximo ${MAX_ACTIVE_INVITES} convites ativos. Revogue um para criar outro.`);
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const invite = await this.prisma.householdInvite.create({
          data: {
            householdId: me.householdId,
            createdById: userId,
            code: generateInviteCode(),
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
        });
        return this.inviteView(invite);
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    throw new ConflictException('Não foi possível gerar o convite. Tente de novo.');
  }

  async revokeInvite(userId: string, inviteId: string) {
    const me = await this.requireOwner(userId);
    const { count } = await this.prisma.householdInvite.deleteMany({
      where: { id: inviteId, householdId: me.householdId },
    });
    if (count === 0) throw new NotFoundException('Convite não encontrado');
  }

  /** Público. Qualquer código que não sirva (inexistente, usado, revogado ou expirado) dá o mesmo 404. */
  async preview(code: string) {
    const invite = await this.prisma.householdInvite.findFirst({
      where: { code: code.toUpperCase(), usedAt: null, expiresAt: { gt: new Date() } },
      select: { household: { select: { name: true } }, createdBy: { select: { name: true } } },
    });
    if (!invite) throw notFoundInvite();
    return {
      householdName: invite.household.name,
      inviterFirstName: invite.createdBy.name.trim().split(/\s+/)[0] ?? '',
    };
  }

  async join(userId: string, code: string) {
    await this.prisma.$transaction(async (tx) => {
      if (await tx.householdMember.findUnique({ where: { userId }, select: { id: true } })) {
        throw new ConflictException('Você já está em uma casa. Saia dela antes de entrar em outra.');
      }
      const invite = await tx.householdInvite.findFirst({
        where: { code, usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, householdId: true },
      });
      if (!invite) throw notFoundInvite();

      // Trava a casa: dois convites usados ao mesmo tempo não furam o limite de membros
      await tx.$queryRaw`SELECT id FROM households WHERE id = ${invite.householdId}::uuid FOR UPDATE`;
      if ((await tx.householdMember.count({ where: { householdId: invite.householdId } })) >= MAX_MEMBERS) {
        throw new ConflictException('Essa casa já está cheia');
      }
      // Consome o convite só se ninguém o usou no meio-tempo
      const claimed = await tx.householdInvite.updateMany({
        where: { id: invite.id, usedAt: null },
        data: { usedAt: new Date(), usedById: userId },
      });
      if (claimed.count !== 1) throw notFoundInvite();

      await tx.householdMember.create({ data: { householdId: invite.householdId, userId, role: 'MEMBER' } });
    }).catch((err) => {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Você já está em uma casa. Saia dela antes de entrar em outra.');
      }
      throw err;
    });
    return this.get(userId);
  }

  // ---- Membros -------------------------------------------------------------

  async updateMyPrefs(userId: string, autoAcceptShared: boolean) {
    const { count } = await this.prisma.householdMember.updateMany({ where: { userId }, data: { autoAcceptShared } });
    if (count === 0) throw new NotFoundException('Você não está em uma casa');
    return this.get(userId);
  }

  async leave(userId: string) {
    const left = await this.prisma.$transaction((tx) => removeFromHousehold(tx, userId));
    if (!left) throw new NotFoundException('Você não está em uma casa');
  }

  async removeMember(ownerId: string, targetId: string) {
    const me = await this.requireOwner(ownerId);
    if (targetId === ownerId) throw new BadRequestException('Para sair da casa, use "Sair da casa"');
    await this.prisma.$transaction(async (tx) => {
      const target = await tx.householdMember.findUnique({ where: { userId: targetId } });
      if (!target || target.householdId !== me.householdId) throw new NotFoundException('Membro não encontrado');
      await removeFromHousehold(tx, targetId);
    });
  }

  private async requireOwner(userId: string) {
    const me = await this.prisma.householdMember.findUnique({ where: { userId } });
    if (!me) throw new NotFoundException('Você não está em uma casa');
    if (me.role !== 'OWNER') throw new ForbiddenException('Só quem criou a casa pode fazer isso');
    return me;
  }
}

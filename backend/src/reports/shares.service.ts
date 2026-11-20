import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import bcrypt from 'bcryptjs';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';
import {
  CODE_LENGTH, EXPIRY_DAYS, generateCode, generateDeviceToken, generateToken, isWellFormedCode, LOCK_MINUTES, MAX_FAILED, MAX_LOCKS, MSG, normalizeCode, sha256,
} from './share';

const MINUTE = 60_000;
/** Hash de mentira para comparar quando o link não existe (o tempo de resposta não revela nada). */
const DUMMY_HASH = bcrypt.hashSync('sem-link', 10);

export interface CreateShareInput {
  from: string;
  to: string;
  expiresInDays: number;
  maxDevices: number;
}

/**
 * Link compartilhável do relatório. O código é OBRIGATÓRIO e nunca é logado; cada aparelho liberado ocupa uma vaga;
 * um GET sem código nunca consome vaga (prévias de mensagem e antivírus só veem o formulário).
 */
@Injectable()
export class ReportSharesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
    private readonly config: ConfigService,
  ) {}

  // ----------------------------------------------------------------------------------------------------- dono (sessão)

  async create(userId: string, input: CreateShareInput, now = new Date()) {
    if (!(EXPIRY_DAYS as readonly number[]).includes(input.expiresInDays)) throw new BadRequestException('Validade inválida');
    if (input.maxDevices !== 1 && input.maxDevices !== 2) throw new BadRequestException('Escolha 1 ou 2 aparelhos');
    // Valida o período do mesmo jeito do relatório (até 93 dias, sem data futura)
    await this.reports.nutritionist(userId, input.from, input.to);
    const code = generateCode();
    const share = await this.prisma.reportShare.create({
      data: {
        userId,
        token: generateToken(),
        codeHash: await bcrypt.hash(code, 10),
        from: parseDay(input.from),
        to: parseDay(input.to),
        expiresAt: new Date(now.getTime() + input.expiresInDays * 86_400_000),
        maxDevices: input.maxDevices,
      },
    });
    // O código sai AQUI, uma única vez
    return { ...this.serialize(share, 0, []), code };
  }

  async list(userId: string, now = new Date()) {
    const rows = await this.prisma.reportShare.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { devices: { orderBy: { createdAt: 'asc' }, select: { createdAt: true, lastSeenAt: true } } },
    });
    return rows.map((r) => this.serialize(r, r.devices.length, r.devices, now));
  }

  async revoke(userId: string, id: string) {
    const { count } = await this.prisma.reportShare.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: 'USER' } });
    if (count === 0) throw new NotFoundException('Link não encontrado');
  }

  /** Apaga os aparelhos liberados do link (a pessoa reenvia o mesmo código se o nutricionista trocou de computador). */
  async releaseDevices(userId: string, id: string) {
    const share = await this.prisma.reportShare.findFirst({ where: { id, userId }, select: { id: true } });
    if (!share) throw new NotFoundException('Link não encontrado');
    const { count } = await this.prisma.reportShareDevice.deleteMany({ where: { linkId: id } });
    return { released: count };
  }

  /** Avisos para a Home: relatório aberto (um por aparelho liberado) e link cancelado por tentativas erradas. */
  async notices(userId: string) {
    const [devices, blocked] = await Promise.all([
      this.prisma.reportShareDevice.findMany({
        where: { notifiedAt: null, link: { userId } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, link: { select: { id: true, maxDevices: true, revokedAt: true, devices: { orderBy: { createdAt: 'asc' }, select: { id: true } } } } },
      }),
      this.prisma.reportShare.findMany({ where: { userId, revokedReason: 'BLOCKS', blockNoticedAt: null }, select: { id: true } }),
    ]);
    return {
      opened: devices.map((d) => ({
        linkId: d.link.id,
        at: d.createdAt.toISOString(),
        deviceNumber: d.link.devices.findIndex((x) => x.id === d.id) + 1,
        maxDevices: d.link.maxDevices,
        revoked: d.link.revokedAt !== null,
      })),
      blocked: blocked.map((b) => ({ linkId: b.id })),
    };
  }

  async markNoticesSeen(userId: string) {
    const now = new Date();
    await this.prisma.reportShareDevice.updateMany({ where: { notifiedAt: null, link: { userId } }, data: { notifiedAt: now } });
    await this.prisma.reportShare.updateMany({ where: { userId, revokedReason: 'BLOCKS', blockNoticedAt: null }, data: { blockNoticedAt: now } });
  }

  private serialize(
    r: { id: string; token: string; from: Date; to: Date; expiresAt: Date; maxDevices: number; revokedAt: Date | null; revokedReason: 'USER' | 'BLOCKS' | null; createdAt: Date },
    used: number,
    devices: { createdAt: Date; lastSeenAt: Date }[],
    now = new Date(),
  ) {
    const status = r.revokedAt ? (r.revokedReason === 'BLOCKS' ? 'blocked' : 'revoked') : r.expiresAt <= now ? 'expired' : 'active';
    return {
      id: r.id,
      token: r.token,
      from: formatDay(r.from),
      to: formatDay(r.to),
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      maxDevices: r.maxDevices,
      devicesUsed: used,
      lastOpenedAt: devices.length ? new Date(Math.max(...devices.map((d) => d.lastSeenAt.getTime()))).toISOString() : null,
      openings: devices.map((d, i) => ({ deviceNumber: i + 1, at: d.createdAt.toISOString() })),
      status,
    };
  }

  // ---------------------------------------------------------------------------------------------------- público (sem sessão)

  private ipHash(ip: string) {
    return sha256(`${ip}|${this.config.get<string>('JWT_SECRET') ?? ''}`);
  }

  private async activeLink(token: string, now: Date) {
    const link = await this.prisma.reportShare.findUnique({ where: { token } });
    return link && !link.revokedAt && link.expiresAt > now ? link : null;
  }

  private async validDevice(linkId: string, deviceToken: string | undefined) {
    if (!deviceToken) return null;
    return this.prisma.reportShareDevice.findUnique({ where: { linkId_deviceTokenHash: { linkId, deviceTokenHash: sha256(deviceToken) } } });
  }

  /**
   * GET público: só entrega o relatório com um cookie de aparelho VÁLIDO daquele link. Sem ele (link desconhecido, expirado,
   * revogado ou sem cookie) a resposta é sempre a mesma, `{ state: 'code' }`: nada é revelado e NENHUMA vaga é consumida.
   */
  async view(token: string, deviceToken: string | undefined, now = new Date()) {
    const link = await this.activeLink(token, now);
    const device = link ? await this.validDevice(link.id, deviceToken) : null;
    if (!link || !device) return { state: 'code' as const };
    await this.prisma.reportShareDevice.update({ where: { id: device.id }, data: { lastSeenAt: now } });
    return { state: 'report' as const, report: await this.reports.nutritionist(link.userId, formatDay(link.from), formatDay(link.to)) };
  }

  /** Código certo + vaga livre = libera o aparelho (devolve o token do cookie). Errado: conta tentativa por link e por IP. */
  async unlock(token: string, rawCode: string, ip: string, existingDeviceToken: string | undefined, now = new Date()) {
    const ipKey = this.ipHash(ip);
    const ipLock = await this.prisma.reportShareIpLock.findUnique({ where: { ipHash: ipKey } });
    if (ipLock?.lockedUntil && ipLock.lockedUntil > now) throw new HttpException(MSG.locked, HttpStatus.TOO_MANY_REQUESTS);

    const link = await this.activeLink(token, now);
    if (link?.lockedUntil && link.lockedUntil > now) throw new HttpException(MSG.locked, HttpStatus.TOO_MANY_REQUESTS);

    const code = normalizeCode(rawCode);
    // Compara sempre (mesmo sem link) para o tempo de resposta não revelar se o link existe
    const ok = await bcrypt.compare(isWellFormedCode(code) ? code : 'X'.repeat(CODE_LENGTH), link?.codeHash ?? DUMMY_HASH);
    if (!link || !ok) {
      await this.registerFailure(link?.id ?? null, ipKey, now);
      throw new UnauthorizedException(MSG.generic);
    }

    // Já é um aparelho liberado: só renova (não consome vaga de novo)
    if (existingDeviceToken && (await this.validDevice(link.id, existingDeviceToken))) {
      return { deviceToken: existingDeviceToken, expiresAt: link.expiresAt, created: false };
    }

    const deviceToken = generateDeviceToken();
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.reportShare.update({ where: { id: link.id }, data: { failedAttempts: 0 } });
      const device = await tx.reportShareDevice.create({ data: { linkId: link.id, deviceTokenHash: sha256(deviceToken) } });
      // Corrida entre dois desbloqueios: confere DEPOIS de criar e desfaz se passou do limite
      const total = await tx.reportShareDevice.count({ where: { linkId: link.id } });
      if (total > link.maxDevices) {
        await tx.reportShareDevice.delete({ where: { id: device.id } });
        return false;
      }
      return true;
    });
    if (!created) throw new ForbiddenException(MSG.noSlot);
    return { deviceToken, expiresAt: link.expiresAt, created: true };
  }

  private async registerFailure(linkId: string | null, ipKey: string, now: Date) {
    const lockedUntil = new Date(now.getTime() + LOCK_MINUTES * MINUTE);
    const ip = await this.prisma.reportShareIpLock.upsert({
      where: { ipHash: ipKey },
      create: { ipHash: ipKey, failures: 1 },
      update: { failures: { increment: 1 } },
    });
    if (ip.failures >= MAX_FAILED) await this.prisma.reportShareIpLock.update({ where: { ipHash: ipKey }, data: { failures: 0, lockedUntil } });
    if (!linkId) return;
    const link = await this.prisma.reportShare.update({ where: { id: linkId }, data: { failedAttempts: { increment: 1 } } });
    if (link.failedAttempts >= MAX_FAILED) {
      const locks = link.lockCount + 1;
      await this.prisma.reportShare.update({
        where: { id: linkId },
        data: { failedAttempts: 0, lockCount: locks, lockedUntil, ...(locks >= MAX_LOCKS ? { revokedAt: now, revokedReason: 'BLOCKS' } : {}) },
      });
    }
  }
}

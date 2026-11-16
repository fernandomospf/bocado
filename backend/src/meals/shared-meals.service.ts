import {
  BadRequestException,
  ForbiddenException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MealSource, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptOfferDto, CreateSharedMealDto } from './dto/shared-meal.dto';
import { latestAllowedDay, MealsService } from './meals.service';
import { splitItems, type SplitItem } from './split';

export const OFFER_TTL_MS = 7 * 86_400_000;
const CLEANUP_EVERY_MS = 24 * 3_600_000;
const SHARE_TOLERANCE = 0.001;
const MAX_PARTICIPANTS = 6;

const round1 = (n: number) => Math.round(n * 10) / 10;

type StoredItem = Omit<SplitItem, 'recipeId'>;

function totalsOf(items: StoredItem[]) {
  const t = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

/** Os alimentos de uma oferta, no formato gravado (ignora qualquer campo fora do esperado). */
function readItems(json: Prisma.JsonValue): StoredItem[] {
  if (!Array.isArray(json)) return [];
  return json.map((raw) => {
    const i = raw as Record<string, unknown>;
    return {
      name: String(i.name ?? ''),
      grams: Number(i.grams) || 0,
      kcal: Number(i.kcal) || 0,
      protein: Number(i.protein) || 0,
      carbs: Number(i.carbs) || 0,
      fat: Number(i.fat) || 0,
      estimated: i.estimated === true,
    };
  });
}

@Injectable()
export class SharedMealsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SharedMealsService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealsService,
  ) {}

  onModuleInit() {
    void this.cleanupExpired();
    this.timer = setInterval(() => void this.cleanupExpired(), CLEANUP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Ofertas vencidas somem ao subir o servidor e a cada 24 h. */
  async cleanupExpired() {
    try {
      const { count } = await this.prisma.sharedMealOffer.deleteMany({ where: { expiresAt: { lte: new Date() } } });
      if (count > 0) this.logger.log(`Ofertas expiradas removidas: ${count}`);
      return count;
    } catch (err) {
      this.logger.warn(`Falha ao limpar ofertas expiradas: ${(err as Error).message}`);
      return 0;
    }
  }

  /**
   * Registra uma refeição uma vez e a divide com a casa. Cada pessoa recebe a sua parte (soma exata):
   * quem ligou "aceitar automaticamente" recebe direto no diário; as demais recebem uma oferta.
   * Tudo numa transação: ou todo mundo recebe, ou ninguém.
   */
  async create(userId: string, dto: CreateSharedMealDto) {
    if (dto.date > latestAllowedDay()) throw new BadRequestException('Não dá para registrar em um dia futuro');

    const ids = dto.participants.map((p) => p.userId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Pessoa repetida na divisão');
    if (ids.length > MAX_PARTICIPANTS) throw new BadRequestException(`No máximo ${MAX_PARTICIPANTS} pessoas`);
    if (!ids.includes(userId)) throw new BadRequestException('Você precisa estar na divisão');
    const total = dto.participants.reduce((s, p) => s + p.share, 0);
    if (Math.abs(total - 1) > SHARE_TOLERANCE) throw new BadRequestException('As partes precisam somar 100%');

    const me = await this.prisma.householdMember.findUnique({ where: { userId }, select: { householdId: true } });
    if (!me) throw new ForbiddenException('Você não está em uma casa');
    const members = await this.prisma.householdMember.findMany({
      where: { householdId: me.householdId, userId: { in: ids } },
      select: { userId: true, autoAcceptShared: true, user: { select: { name: true } } },
    });
    if (members.length !== ids.length) throw new ForbiddenException('Só dá para dividir com pessoas da sua casa');
    const byId = new Map(members.map((m) => [m.userId, m]));

    const items = await this.meals.keepVisibleRecipeIds(userId, dto.items);
    const parts = splitItems(items, dto.participants.map((p) => p.share));
    const groupId = randomUUID();
    const source = dto.source ?? MealSource.MANUAL;
    const date = parseDay(dto.date);
    const expiresAt = new Date(Date.now() + OFFER_TTL_MS);

    const result = await this.prisma.$transaction(async (tx) => {
      const delivered: { userId: string; name: string; status: 'added' | 'offered' }[] = [];
      let mine: Prisma.MealGetPayload<{ include: { items: true } }> | null = null;

      for (const [idx, p] of dto.participants.entries()) {
        const slice = parts[idx];
        if (p.userId === userId) {
          mine = await tx.meal.create({
            data: {
              userId,
              date,
              type: dto.type,
              source,
              note: dto.note || null,
              sharedGroupId: groupId,
              sharedById: userId,
              share: p.share,
              items: { create: slice },
            },
            include: { items: true },
          });
          continue;
        }
        const member = byId.get(p.userId)!;
        // A cópia de quem recebe nunca carrega recipeId: o uso da receita é de quem registrou
        const stored = slice.map(({ recipeId: _r, ...i }) => i);
        if (member.autoAcceptShared) {
          await tx.meal.create({
            data: {
              userId: p.userId,
              date,
              type: dto.type,
              source,
              sharedGroupId: groupId,
              sharedById: userId,
              share: p.share,
              items: { create: stored },
            },
          });
          delivered.push({ userId: p.userId, name: member.user.name, status: 'added' });
        } else {
          await tx.sharedMealOffer.create({
            data: {
              groupId,
              fromUserId: userId,
              toUserId: p.userId,
              date,
              type: dto.type,
              source,
              share: p.share,
              items: stored as unknown as Prisma.InputJsonValue,
              expiresAt,
            },
          });
          delivered.push({ userId: p.userId, name: member.user.name, status: 'offered' });
        }
      }
      return { mine: mine!, delivered };
    });

    return { meal: this.meals.serializeMeal(result.mine), delivered: result.delivered };
  }

  /** Ofertas pendentes e válidas recebidas pelo usuário, com quem enviou (nome e foto) e os totais da parte dele. */
  async listOffers(userId: string) {
    const offers = await this.prisma.sharedMealOffer.findMany({
      where: { toUserId: userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      include: { from: { select: { id: true, name: true, avatarUrl: true } } },
    });
    return offers.map((o) => {
      const items = readItems(o.items);
      return {
        id: o.id,
        date: o.date.toISOString().slice(0, 10),
        type: o.type,
        share: o.share,
        from: o.from,
        totals: totalsOf(items),
        items: items.map((i) => ({ name: i.name, grams: i.grams })),
        expiresAt: o.expiresAt,
      };
    });
  }

  async accept(userId: string, offerId: string, dto: AcceptOfferDto) {
    const meal = await this.prisma.$transaction(async (tx) => {
      const offer = await tx.sharedMealOffer.findFirst({ where: { id: offerId, toUserId: userId } });
      if (!offer) throw new NotFoundException('Oferta não encontrada');
      // A limpeza diária apaga as vencidas; aqui só se recusa
      if (offer.expiresAt <= new Date()) throw new GoneException('Essa oferta expirou');
      // Consome a oferta primeiro: dois toques ao mesmo tempo só criam uma refeição
      const { count } = await tx.sharedMealOffer.deleteMany({ where: { id: offer.id, toUserId: userId } });
      if (count !== 1) throw new NotFoundException('Oferta não encontrada');

      const created = await tx.meal.create({
        data: {
          userId,
          date: offer.date,
          type: dto.type ?? offer.type,
          source: offer.source,
          sharedGroupId: offer.groupId,
          sharedById: offer.fromUserId,
          share: offer.share,
          items: { create: readItems(offer.items) },
        },
        include: { items: true },
      });
      if (dto.always) await tx.householdMember.updateMany({ where: { userId }, data: { autoAcceptShared: true } });
      return created;
    });
    return this.meals.serializeMeal(meal);
  }

  async dismiss(userId: string, offerId: string) {
    const { count } = await this.prisma.sharedMealOffer.deleteMany({ where: { id: offerId, toUserId: userId } });
    if (count === 0) throw new NotFoundException('Oferta não encontrada');
  }
}

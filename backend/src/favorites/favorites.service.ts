import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { FavoriteMeal, MealSource, Prisma } from '@prisma/client';
import { latestAllowedDay, MealsService } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { mealGroupKey } from '../suggestions/close-day.math';
import { CreateFavoriteDto, LogFavoriteDto } from './dto/favorite.dto';

export const MAX_FAVORITES = 50;

export interface FavoriteItem {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** O Json do banco é nosso, mas nunca confiamos cegamente nele. */
function itemsOf(f: Pick<FavoriteMeal, 'items'>): FavoriteItem[] {
  return Array.isArray(f.items) ? (f.items as unknown as FavoriteItem[]) : [];
}

function serialize(f: FavoriteMeal) {
  const items = itemsOf(f);
  const t = items.reduce(
    (a, i) => ({ kcal: a.kcal + i.kcal, protein: a.protein + i.protein, carbs: a.carbs + i.carbs, fat: a.fat + i.fat }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return {
    id: f.id,
    name: f.name,
    type: f.type,
    items,
    totals: { kcal: Math.round(t.kcal), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) },
    createdAt: f.createdAt,
    lastUsedAt: f.lastUsedAt,
  };
}

@Injectable()
export class FavoritesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly meals: MealsService,
  ) {}

  /** As usadas mais recentemente primeiro; as nunca usadas depois, da mais nova para a mais antiga. */
  async list(userId: string) {
    const rows = await this.prisma.favoriteMeal.findMany({
      where: { userId },
      orderBy: [{ lastUsedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });
    return rows.map(serialize);
  }

  /**
   * Salva uma refeição do usuário como favorita (snapshot dos itens). Se um conjunto igual já é favorito, devolve
   * a favorita existente em vez de duplicar. Máximo de 50 por usuário (409).
   */
  async create(userId: string, dto: CreateFavoriteDto) {
    const meal = await this.prisma.meal.findFirst({ where: { id: dto.fromMealId, userId }, include: { items: true } });
    if (!meal) throw new NotFoundException('Refeição não encontrada');
    if (meal.items.length === 0) throw new BadRequestException('Essa refeição não tem alimentos');

    const items: FavoriteItem[] = meal.items.map(({ name, grams, kcal, protein, carbs, fat }) => ({
      name,
      grams,
      kcal,
      protein,
      carbs,
      fat,
    }));

    const existing = await this.prisma.favoriteMeal.findMany({ where: { userId } });
    const key = mealGroupKey(items);
    const same = existing.find((f) => mealGroupKey(itemsOf(f)) === key);
    if (same) return { ...serialize(same), alreadyExists: true };
    if (existing.length >= MAX_FAVORITES) {
      throw new ConflictException(`Você já tem ${MAX_FAVORITES} favoritas. Exclua alguma para salvar outra.`);
    }

    const name = dto.name || items.slice(0, 2).map((i) => i.name).join(' + ').slice(0, 60);
    const created = await this.prisma.favoriteMeal.create({
      data: { userId, name, type: meal.type, items: items as unknown as Prisma.InputJsonValue },
    });
    return { ...serialize(created), alreadyExists: false };
  }

  async rename(userId: string, id: string, name: string) {
    const { count } = await this.prisma.favoriteMeal.updateMany({ where: { id, userId }, data: { name } });
    if (count === 0) throw new NotFoundException('Favorita não encontrada');
    return serialize(await this.prisma.favoriteMeal.findUniqueOrThrow({ where: { id } }));
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.favoriteMeal.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Favorita não encontrada');
  }

  /** Registra a favorita como uma refeição nova (tipo e data informados) e marca o uso. */
  async log(userId: string, id: string, dto: LogFavoriteDto) {
    if (dto.date > latestAllowedDay()) throw new BadRequestException('Não dá para registrar em um dia futuro');
    const fav = await this.prisma.favoriteMeal.findFirst({ where: { id, userId } });
    if (!fav) throw new NotFoundException('Favorita não encontrada');
    const items = itemsOf(fav);
    if (items.length === 0) throw new BadRequestException('Essa favorita não tem alimentos');

    const meal = await this.meals.create(userId, {
      date: dto.date,
      type: dto.type,
      source: MealSource.MANUAL,
      items: items.map(({ name, grams, kcal, protein, carbs, fat }) => ({ name, grams, kcal, protein, carbs, fat })),
    });
    await this.prisma.favoriteMeal.update({ where: { id }, data: { lastUsedAt: new Date() } });
    return meal;
  }
}

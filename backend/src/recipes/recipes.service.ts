import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FoodSource, Prisma, Recipe, RecipeIngredient } from '@prisma/client';
import { normalizeName } from '../foods/food-normalize';
import { PrismaService } from '../prisma/prisma.service';
import { SaveRecipeDto } from './dto/recipe.dto';
import { computeRecipe } from './recipe.math';

type RecipeWithIngredients = Recipe & { ingredients: RecipeIngredient[] };

/** Formato usado pela busca de alimentos (origin 'recipe'). */
export interface RecipeFoodResult {
  id: string;
  name: string;
  origin: 'recipe';
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  portion?: { grams: number; label: string };
  whole: { grams: number };
}

const SEARCH_SCAN_LIMIT = 300;

@Injectable()
export class RecipesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Quem pode VER uma receita: o dono e, se ela estiver compartilhada, os membros da casa.
   * Ponto único da regra de acesso (a parte da casa é preenchida quando o usuário tiver uma).
   */
  protected async visibleWhere(userId: string): Promise<Prisma.RecipeWhereInput> {
    const householdId = await this.householdOf(userId);
    return householdId ? { OR: [{ ownerId: userId }, { householdId }] } : { ownerId: userId };
  }

  /** Casa do usuário. Sem o módulo de casas, ninguém tem casa. */
  protected async householdOf(_userId: string): Promise<string | null> {
    return null;
  }

  async list(userId: string) {
    const recipes = await this.prisma.recipe.findMany({
      where: await this.visibleWhere(userId),
      include: { ingredients: { select: { grams: true } } },
      orderBy: { updatedAt: 'desc' },
    });
    return recipes.map((r) => {
      const baseGrams = baseGramsOf(r, r.ingredients);
      return {
        id: r.id,
        name: r.name,
        servings: r.servings,
        baseGrams,
        per100: per100Of(r),
        portionGrams: r.servings ? round1(baseGrams / r.servings) : null,
        ingredientCount: r.ingredients.length,
        isOwner: r.ownerId === userId,
        shared: r.householdId !== null,
        updatedAt: r.updatedAt,
      };
    });
  }

  async get(userId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { AND: [{ id }, await this.visibleWhere(userId)] },
      include: { ingredients: { orderBy: { position: 'asc' } } },
    });
    if (!recipe) throw new NotFoundException('Receita não encontrada');
    return this.serialize(recipe, userId);
  }

  async create(userId: string, dto: SaveRecipeDto) {
    const data = await this.prepare(userId, dto);
    const recipe = await this.prisma.recipe.create({
      data: { ...data.fields, ownerId: userId, ingredients: { create: data.ingredients } },
      include: { ingredients: { orderBy: { position: 'asc' } } },
    });
    return this.serialize(recipe, userId);
  }

  async update(userId: string, id: string, dto: SaveRecipeDto) {
    await this.assertOwner(userId, id);
    const data = await this.prepare(userId, dto);
    const recipe = await this.prisma.$transaction(async (tx) => {
      await tx.recipeIngredient.deleteMany({ where: { recipeId: id } });
      return tx.recipe.update({
        where: { id },
        data: { ...data.fields, ingredients: { create: data.ingredients } },
        include: { ingredients: { orderBy: { position: 'asc' } } },
      });
    });
    return this.serialize(recipe, userId);
  }

  async remove(userId: string, id: string) {
    await this.assertOwner(userId, id);
    await this.prisma.recipe.delete({ where: { id } });
  }

  /** Receitas visíveis que casam com a busca, no formato da busca de alimentos. */
  async searchAsFoods(userId: string, tokens: string[], limit: number): Promise<RecipeFoodResult[]> {
    const recipes = await this.prisma.recipe.findMany({
      where: await this.visibleWhere(userId),
      include: { ingredients: { select: { grams: true } } },
      orderBy: { updatedAt: 'desc' },
      take: SEARCH_SCAN_LIMIT,
    });
    return recipes
      .filter((r) => {
        const name = normalizeName(r.name);
        return tokens.every((t) => name.includes(t));
      })
      .slice(0, limit)
      .map((r) => {
        const baseGrams = baseGramsOf(r, r.ingredients);
        return {
          id: r.id,
          name: r.name,
          origin: 'recipe' as const,
          per100: per100Of(r),
          ...(r.servings ? { portion: { grams: round1(baseGrams / r.servings), label: '1 porção' } } : {}),
          whole: { grams: baseGrams },
        };
      });
  }

  /**
   * Só o dono edita ou exclui. Quem não vê a receita recebe 404 (não revela que ela existe);
   * quem vê, mas não é dono (membro da casa), recebe 403.
   */
  private async assertOwner(userId: string, id: string) {
    const recipe = await this.prisma.recipe.findFirst({
      where: { AND: [{ id }, await this.visibleWhere(userId)] },
      select: { ownerId: true },
    });
    if (!recipe) throw new NotFoundException('Receita não encontrada');
    if (recipe.ownerId !== userId) throw new ForbiddenException('Só quem criou a receita pode alterá-la');
  }

  /** Recalcula os valores por 100 g e valida os alimentos de origem (TACO ou próprios do usuário). */
  private async prepare(userId: string, dto: SaveRecipeDto) {
    const nutrition = computeRecipe(dto.ingredients, dto.totalCookedGrams, dto.servings);

    const foodIds = [...new Set(dto.ingredients.map((i) => i.foodId).filter((v): v is string => !!v))];
    const allowed = foodIds.length
      ? await this.prisma.food.findMany({
          where: { id: { in: foodIds }, OR: [{ source: FoodSource.TACO }, { userId }] },
          select: { id: true },
        })
      : [];
    const allowedIds = new Set(allowed.map((f) => f.id));

    return {
      fields: {
        name: dto.name,
        notes: dto.notes || null,
        totalCookedGrams: dto.totalCookedGrams ?? null,
        servings: dto.servings ?? null,
        kcal100: nutrition.per100.kcal,
        protein100: nutrition.per100.protein,
        carbs100: nutrition.per100.carbs,
        fat100: nutrition.per100.fat,
      },
      ingredients: dto.ingredients.map((i, position) => ({
        // Alimento inexistente ou de outro usuário: guarda só o snapshot dos valores
        foodId: i.foodId && allowedIds.has(i.foodId) ? i.foodId : null,
        name: i.name,
        grams: i.grams,
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
        position,
      })),
    };
  }

  private serialize(r: RecipeWithIngredients, userId: string) {
    const nutrition = computeRecipe(r.ingredients, r.totalCookedGrams, r.servings);
    return {
      id: r.id,
      name: r.name,
      notes: r.notes,
      totalCookedGrams: r.totalCookedGrams,
      servings: r.servings,
      isOwner: r.ownerId === userId,
      shared: r.householdId !== null,
      nutrition,
      ingredients: r.ingredients.map((i) => ({
        id: i.id,
        foodId: i.foodId,
        name: i.name,
        grams: i.grams,
        kcal: i.kcal,
        protein: i.protein,
        carbs: i.carbs,
        fat: i.fat,
      })),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function baseGramsOf(r: Pick<Recipe, 'totalCookedGrams'>, ingredients: { grams: number }[]) {
  return round1(r.totalCookedGrams ?? ingredients.reduce((s, i) => s + i.grams, 0));
}

function per100Of(r: Pick<Recipe, 'kcal100' | 'protein100' | 'carbs100' | 'fat100'>) {
  return { kcal: r.kcal100, protein: r.protein100, carbs: r.carbs100, fat: r.fat100 };
}

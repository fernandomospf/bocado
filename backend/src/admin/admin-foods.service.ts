import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FoodSource, FoodStatus } from '@prisma/client';
import {
  barcodePairs,
  clusterPairs,
  type DuplicatePair,
  NAME_SIMILARITY_MIN,
  valuesClose,
} from '../foods/duplicates';
import { isVerified } from '../foods/foods.service';
import { PrismaService } from '../prisma/prisma.service';

const MAX_GROUPS = 50;
const CANDIDATE_STATUSES = [FoodStatus.ACTIVE, FoodStatus.REPORTED];
const PRODUCT_SOURCES = [FoodSource.OFF, FoodSource.LABEL];

interface PairRow {
  a: string;
  b: string;
}

/**
 * Admin > Acervo: possíveis duplicados de produtos (OFF e LABEL) e a união ("Unir"). Nada é apagado: os duplicados viram
 * MERGED e apontam para o canônico; os itens já registrados guardam o snapshot e não mudam.
 */
@Injectable()
export class AdminFoodsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Grupos de duplicados: mesmo código de barras, ou nome + marca parecidos com valores por 100 g a até 5%. */
  async duplicates() {
    const foods = await this.prisma.food.findMany({
      where: { source: { in: PRODUCT_SOURCES }, status: { in: CANDIDATE_STATUSES } },
      select: {
        id: true, name: true, brand: true, barcode: true, source: true, status: true,
        kcal100: true, protein100: true, carbs100: true, fat100: true,
        servingGrams: true, servingLabel: true, verifyCount: true, reportCount: true, createdAt: true, contributedById: true,
      },
    });
    const byId = new Map(foods.map((f) => [f.id, f]));

    // Nome + marca normalizados parecidos (pg_trgm, que já tem índice); o filtro dos valores é feito aqui
    const similar = await this.prisma.$queryRaw<PairRow[]>`
      SELECT a.id AS a, b.id AS b
        FROM foods a
        JOIN foods b ON a.id < b.id AND a."searchName" % b."searchName"
       WHERE a.source IN ('OFF'::"FoodSource", 'LABEL'::"FoodSource")
         AND b.source IN ('OFF'::"FoodSource", 'LABEL'::"FoodSource")
         AND a.status IN ('ACTIVE'::"FoodStatus", 'REPORTED'::"FoodStatus")
         AND b.status IN ('ACTIVE'::"FoodStatus", 'REPORTED'::"FoodStatus")
         AND similarity(a."searchName", b."searchName") >= ${NAME_SIMILARITY_MIN}
       LIMIT 2000`;

    const pairs: DuplicatePair[] = [
      ...barcodePairs(foods.map((f) => ({ id: f.id, barcode: f.barcode, kcal100: f.kcal100, protein100: f.protein100, carbs100: f.carbs100, fat100: f.fat100 }))),
      ...similar.flatMap(({ a, b }) => {
        const fa = byId.get(a);
        const fb = byId.get(b);
        return fa && fb && valuesClose(fa, fb) ? [{ a, b, reason: 'name' as const }] : [];
      }),
    ];

    const groups = clusterPairs(pairs).slice(0, MAX_GROUPS);
    return {
      groups: groups.map((g) => ({
        reasons: g.reasons,
        items: g.ids.flatMap((id) => {
          const f = byId.get(id);
          return f
            ? [
                {
                  id: f.id, name: f.name, brand: f.brand, barcode: f.barcode, source: f.source, status: f.status,
                  per100: { kcal: f.kcal100, protein: f.protein100, carbs: f.carbs100, fat: f.fat100 },
                  serving: f.servingGrams ? { grams: f.servingGrams, label: f.servingLabel } : null,
                  verifyCount: f.verifyCount, verified: isVerified(f.verifyCount), reportCount: f.reportCount, createdAt: f.createdAt,
                },
              ]
            : [];
        }),
      })),
    };
  }

  /**
   * "Unir": o canônico fica; os outros viram MERGED apontando para ele e as confirmações deles passam para o canônico
   * (uma por pessoa; o criador do canônico não conta). Sem apagar nada.
   */
  async merge(canonicalId: string, mergeIds: string[]) {
    const ids = [...new Set(mergeIds)].filter((id) => id !== canonicalId);
    if (ids.length === 0) throw new BadRequestException('Escolha ao menos um produto para unir ao canônico.');

    return this.prisma.$transaction(async (tx) => {
      const canonical = await tx.food.findUnique({ where: { id: canonicalId } });
      if (!canonical || !PRODUCT_SOURCES.includes(canonical.source as never)) throw new NotFoundException('Produto canônico não encontrado');
      if (canonical.status === FoodStatus.MERGED) throw new BadRequestException('O canônico já foi unido a outro produto.');

      const others = await tx.food.findMany({ where: { id: { in: ids } } });
      if (others.length !== ids.length) throw new NotFoundException('Produto não encontrado');
      if (others.some((o) => !PRODUCT_SOURCES.includes(o.source as never) || o.status === FoodStatus.MERGED)) {
        throw new BadRequestException('Só produtos do acervo ainda não unidos podem ser unidos.');
      }

      // Confirmações dos duplicados passam para o canônico (sem repetir pessoa, sem o criador do canônico)
      const moving = await tx.foodConfirmation.findMany({ where: { foodId: { in: ids } }, select: { userId: true } });
      const already = new Set((await tx.foodConfirmation.findMany({ where: { foodId: canonicalId }, select: { userId: true } })).map((c) => c.userId));
      const toAdd = [...new Set(moving.map((m) => m.userId))].filter((u) => !already.has(u) && u !== canonical.contributedById);
      if (toAdd.length) {
        await tx.foodConfirmation.createMany({ data: toAdd.map((userId) => ({ foodId: canonicalId, userId })), skipDuplicates: true });
      }
      const verifyCount = await tx.foodConfirmation.count({ where: { foodId: canonicalId } });

      // Quem já apontava para um dos unidos passa a apontar para o canônico
      await tx.food.updateMany({ where: { mergedIntoId: { in: ids } }, data: { mergedIntoId: canonicalId } });
      await tx.food.updateMany({ where: { id: { in: ids } }, data: { status: FoodStatus.MERGED, mergedIntoId: canonicalId } });
      await tx.food.update({ where: { id: canonicalId }, data: { verifyCount } });
      return { canonicalId, merged: ids, verifyCount, verified: isVerified(verifyCount) };
    });
  }
}

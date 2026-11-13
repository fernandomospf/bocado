/**
 * Seed da base TACO (idempotente).
 * - Se a TACO já está no banco, não faz nada (é o que roda a cada deploy).
 * - Com --force, faz upsert de todos os alimentos por nome + fonte TACO (para atualizar valores ou porções).
 *
 * Dev:    npx prisma db seed            (ou: npx prisma db seed -- --force)
 * Docker: node dist-seed/prisma/seed.js (compilado no build)
 */
import { FoodSource, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeName } from '../src/foods/food-normalize';

interface TacoFood {
  name: string;
  category: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface Portion {
  food: string;
  grams: number;
  label: string;
}

function dataDir(): string {
  const candidates = [join(__dirname, 'data'), join(process.cwd(), 'prisma', 'data')];
  const dir = candidates.find((d) => existsSync(join(d, 'taco.json')));
  if (!dir) throw new Error(`taco.json não encontrado em: ${candidates.join(', ')}`);
  return dir;
}

const readJson = <T>(dir: string, file: string): T => JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;

async function main() {
  const prisma = new PrismaClient();
  const force = process.argv.includes('--force');
  try {
    const existing = await prisma.food.count({ where: { source: FoodSource.TACO } });
    if (existing > 0 && !force) {
      console.log(`[seed] TACO já carregada (${existing} alimentos). Nada a fazer.`);
      return;
    }

    const dir = dataDir();
    const foods = readJson<TacoFood[]>(dir, 'taco.json');
    const portions = readJson<Portion[]>(dir, 'portions.json');

    const names = new Set(foods.map((f) => f.name));
    const unknown = portions.filter((p) => !names.has(p.food)).map((p) => p.food);
    if (unknown.length) throw new Error(`portions.json cita alimentos que não existem na TACO: ${unknown.join('; ')}`);
    const portionByName = new Map(portions.map((p) => [p.food, p]));

    const current = await prisma.food.findMany({ where: { source: FoodSource.TACO }, select: { id: true, name: true } });
    const idByName = new Map(current.map((f) => [f.name, f.id]));

    const rows = foods.map((f) => {
      const portion = portionByName.get(f.name);
      return {
        name: f.name,
        searchName: normalizeName(f.name),
        category: f.category,
        source: FoodSource.TACO,
        kcal100: f.kcal,
        protein100: f.protein,
        carbs100: f.carbs,
        fat100: f.fat,
        portionGrams: portion?.grams ?? null,
        portionLabel: portion?.label ?? null,
      };
    });

    const toCreate = rows.filter((r) => !idByName.has(r.name));
    const toUpdate = rows.filter((r) => idByName.has(r.name));

    await prisma.$transaction([
      prisma.food.createMany({ data: toCreate }),
      ...toUpdate.map((r) => prisma.food.update({ where: { id: idByName.get(r.name)! }, data: r })),
    ]);
    console.log(`[seed] TACO: ${toCreate.length} criados, ${toUpdate.length} atualizados, ${portions.length} porções.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[seed] Falhou:', err instanceof Error ? err.message : err);
  process.exit(1);
});

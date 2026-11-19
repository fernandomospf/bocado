import { formatDay, parseDay } from '../common/dates';
import type { PrismaService } from '../prisma/prisma.service';
import { addDays } from '../weight/weight.math';
import { LOW_INTAKE_DAYS } from '../profile/glp1';

/** Até onde olhar para trás procurando os 5 dias registrados. */
const LOOKBACK_DAYS = 14;

/** kcal total dos dias REGISTRADOS (com ao menos um alimento) até `upTo`, do mais recente para o mais antigo. */
export async function recentLoggedKcal(prisma: Pick<PrismaService, 'meal'>, userId: string, upTo: string): Promise<number[]> {
  const meals = await prisma.meal.findMany({
    where: { userId, date: { gte: parseDay(addDays(upTo, -(LOOKBACK_DAYS - 1))), lte: parseDay(upTo) } },
    select: { date: true, items: { select: { kcal: true } } },
  });
  const byDay = new Map<string, number>();
  for (const m of meals) {
    if (m.items.length === 0) continue;
    const day = formatDay(m.date);
    byDay.set(day, (byDay.get(day) ?? 0) + m.items.reduce((s, i) => s + i.kcal, 0));
  }
  return [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, LOW_INTAKE_DAYS)
    .map(([, kcal]) => kcal);
}

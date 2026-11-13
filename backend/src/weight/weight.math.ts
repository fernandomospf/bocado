/** Cálculos do controle de peso, sem acesso a banco (testáveis isoladamente). Datas no formato "YYYY-MM-DD". */

export const TREND_WINDOW_DAYS = 7;
export const TARGETS_OUTDATED_KG = 2;

export interface WeightPoint {
  date: string;
  weightKg: number;
}

export interface WeightPointWithTrend extends WeightPoint {
  /** Média dos registros dos 7 dias terminando nesta data (inclusive). */
  trendKg: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dia como número inteiro (dias desde 1970-01-01), para comparar janelas sem fuso horário. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Média móvel por registro: para cada data, a média dos registros existentes em [data − 6, data].
 * Dias sem registro simplesmente não entram na média (não são interpolados).
 */
export function movingAverages(points: WeightPoint[], windowDays = TREND_WINDOW_DAYS): WeightPointWithTrend[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const days = sorted.map((p) => dayNumber(p.date));
  let start = 0;
  let sum = 0;
  return sorted.map((p, i) => {
    sum += p.weightKg;
    while (days[i] - days[start] >= windowDays) {
      sum -= sorted[start].weightKg;
      start += 1;
    }
    return { ...p, trendKg: round2(sum / (i - start + 1)) };
  });
}

export interface WeightTrendSummary {
  latest: WeightPoint | null;
  trendKg: number | null;
  change7Kg: number | null;
  change30Kg: number | null;
}

/**
 * Tendência atual = média móvel no registro mais recente.
 * Variação em N dias = tendência atual − tendência do último registro feito até N dias antes dele.
 * Sem registro tão antigo, a variação fica nula.
 */
export function summarizeTrend(points: WeightPoint[]): WeightTrendSummary {
  const withTrend = movingAverages(points);
  const last = withTrend.at(-1);
  if (!last) return { latest: null, trendKg: null, change7Kg: null, change30Kg: null };

  const changeOver = (days: number) => {
    const limit = dayNumber(last.date) - days;
    const ref = [...withTrend].reverse().find((p) => dayNumber(p.date) <= limit);
    return ref ? round2(last.trendKg - ref.trendKg) : null;
  };

  return {
    latest: { date: last.date, weightKg: last.weightKg },
    trendKg: last.trendKg,
    change7Kg: changeOver(7),
    change30Kg: changeOver(30),
  };
}

/** Metas desatualizadas quando a tendência se afastou 2 kg ou mais do peso usado no cálculo delas. */
export function isTargetsOutdated(trendKg: number | null, targetsWeightKg: number | null): boolean {
  if (trendKg === null || targetsWeightKg === null) return false;
  // Arredonda para não errar no limite por ponto flutuante (96,2 − 94,2 = 2,0000000000000027)
  return round2(Math.abs(trendKg - targetsWeightKg)) >= TARGETS_OUTDATED_KG;
}

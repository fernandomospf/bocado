import { ISO_DATE } from '../common/dates';

/**
 * Importação de histórico de peso: validação e normalização PURAS (o servidor revalida tudo, mesmo com o app já
 * tendo validado no aparelho). Um registro por dia: vários no mesmo dia viram a MÉDIA.
 */

export const IMPORT_MIN_KG = 30;
export const IMPORT_MAX_KG = 350;
export const IMPORT_MIN_DATE = '1950-01-01';
export const IMPORT_MAX_BATCH = 5000;

export interface RawEntry {
  date: string;
  weightKg: number;
}

export interface NormalizedImport {
  /** Um por dia, ordenados por data. */
  entries: RawEntry[];
  /** Descartados e por quê. */
  discarded: { invalidDate: number; futureDate: number; beforeMin: number; outOfRange: number };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function validDay(date: string): boolean {
  if (!ISO_DATE.test(date)) return false;
  const d = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/**
 * `maxDate` é o último dia aceito: o servidor não sabe o fuso, então aceita até 1 dia além da data UTC (como o PUT do dia).
 */
export function normalizeImport(raw: RawEntry[], maxDate: string): NormalizedImport {
  const discarded = { invalidDate: 0, futureDate: 0, beforeMin: 0, outOfRange: 0 };
  const byDay = new Map<string, number[]>();
  for (const e of raw) {
    if (!validDay(e.date)) {
      discarded.invalidDate++;
      continue;
    }
    if (e.date > maxDate) {
      discarded.futureDate++;
      continue;
    }
    if (e.date < IMPORT_MIN_DATE) {
      discarded.beforeMin++;
      continue;
    }
    const kg = round1(e.weightKg);
    if (!Number.isFinite(kg) || kg < IMPORT_MIN_KG || kg > IMPORT_MAX_KG) {
      discarded.outOfRange++;
      continue;
    }
    byDay.set(e.date, [...(byDay.get(e.date) ?? []), kg]);
  }
  const entries = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, kgs]) => ({ date, weightKg: round1(kgs.reduce((s, k) => s + k, 0) / kgs.length) }));
  return { entries, discarded };
}

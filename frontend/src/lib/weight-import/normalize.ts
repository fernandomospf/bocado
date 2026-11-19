/**
 * Importar histórico de peso: normalização (pura). Tudo roda no aparelho; só datas e pesos já interpretados são enviados.
 * Converte para kg, arredonda a 1 casa, descarta o inválido, faz a MÉDIA do dia e destaca saltos suspeitos.
 */

export const LB_TO_KG = 0.45359237;
export const MIN_KG = 30;
export const MAX_KG = 350;
export const MIN_DATE = '1950-01-01';
/** Salto entre dias seguidos que merece conferência (kg). */
export const JUMP_KG = 5;
/** Máximo de registros por envio ao servidor. */
export const BATCH_SIZE = 5000;

export type Unit = 'kg' | 'lb';

/** Um registro lido do arquivo, antes da normalização. `date` já é o dia local (AAAA-MM-DD). */
export interface RawReading {
  date: string;
  value: number;
  unit: Unit;
}

export interface DayEntry {
  date: string;
  weightKg: number;
  /** Quantos registros do arquivo viraram este dia (média quando > 1). */
  readings: number;
}

export interface Discarded {
  outOfRange: number;
  futureDate: number;
  beforeMin: number;
  invalid: number;
}

export interface Jump {
  from: string;
  to: string;
  fromKg: number;
  toKg: number;
  diffKg: number;
}

export interface ImportPreview {
  entries: DayEntry[];
  /** Registros lidos do arquivo (antes de agrupar por dia). */
  totalReadings: number;
  /** Dias em que a média de vários registros foi usada. */
  averagedDays: number;
  period: { from: string; to: string } | null;
  discarded: Discarded;
  discardedTotal: number;
  jumps: Jump[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const toKg = (value: number, unit: Unit) => round1(unit === 'lb' ? value * LB_TO_KG : value);

function dayNumber(date: string) {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

export function isRealDay(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

/** `today`: o dia local do aparelho (AAAA-MM-DD); datas depois dele são descartadas. */
export function buildPreview(readings: RawReading[], today: string): ImportPreview {
  const discarded: Discarded = { outOfRange: 0, futureDate: 0, beforeMin: 0, invalid: 0 };
  const byDay = new Map<string, number[]>();
  for (const r of readings) {
    if (!isRealDay(r.date) || !Number.isFinite(r.value)) {
      discarded.invalid++;
      continue;
    }
    if (r.date > today) {
      discarded.futureDate++;
      continue;
    }
    if (r.date < MIN_DATE) {
      discarded.beforeMin++;
      continue;
    }
    const kg = toKg(r.value, r.unit);
    if (kg < MIN_KG || kg > MAX_KG) {
      discarded.outOfRange++;
      continue;
    }
    byDay.set(r.date, [...(byDay.get(r.date) ?? []), kg]);
  }
  const entries: DayEntry[] = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, kgs]) => ({ date, weightKg: round1(kgs.reduce((s, k) => s + k, 0) / kgs.length), readings: kgs.length }));

  const jumps: Jump[] = [];
  for (let i = 1; i < entries.length; i++) {
    const a = entries[i - 1];
    const b = entries[i];
    const diff = round1(b.weightKg - a.weightKg);
    if (dayNumber(b.date) - dayNumber(a.date) === 1 && Math.abs(diff) > JUMP_KG) {
      jumps.push({ from: a.date, to: b.date, fromKg: a.weightKg, toKg: b.weightKg, diffKg: diff });
    }
  }
  return {
    entries,
    totalReadings: readings.length,
    averagedDays: entries.filter((e) => e.readings > 1).length,
    period: entries.length ? { from: entries[0].date, to: entries[entries.length - 1].date } : null,
    discarded,
    discardedTotal: discarded.outOfRange + discarded.futureDate + discarded.beforeMin + discarded.invalid,
    jumps,
  };
}

/** Divide em lotes do mesmo import (até 5.000 por envio). */
export function toBatches<T>(items: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Texto do motivo de cada tipo de descarte (sem julgamento). */
export const DISCARD_LABEL: Record<keyof Discarded, string> = {
  outOfRange: 'peso fora de 30 a 350 kg',
  futureDate: 'data futura',
  beforeMin: 'data anterior a 1950',
  invalid: 'linha ilegível',
};

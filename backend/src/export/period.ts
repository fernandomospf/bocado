import { BadRequestException } from '@nestjs/common';

/** Períodos de exportação aceitos (rótulos na interface: 7 dias, 15 dias, 1 mês, 3 meses, 6 meses, último ano). */
export const EXPORT_PERIODS = { '7d': 7, '15d': 15, '30d': 30, '90d': 90, '180d': 180, '365d': 365 } as const;
export type ExportPeriod = keyof typeof EXPORT_PERIODS;

/** Lote de dias por consulta: um ano inteiro nunca fica na memória de uma vez. */
export const EXPORT_BATCH_DAYS = 31;

const DAY_MS = 86_400_000;

const toDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function shiftDay(iso: string, days: number): string {
  return toIso(new Date(toDate(iso).getTime() + days * DAY_MS));
}

/**
 * `to` é "hoje" no fuso do usuário (o servidor não sabe o fuso): aceita até 1 dia além da data UTC atual.
 * from = to − (N − 1) dias, ou seja, N dias contando o próprio `to`.
 */
export function resolvePeriod(period: ExportPeriod, to: string, now = new Date()) {
  const days = EXPORT_PERIODS[period];
  if (!days) throw new BadRequestException('Período inválido');
  if (Number.isNaN(toDate(to).getTime())) throw new BadRequestException('Data inválida');
  if (to > shiftDay(toIso(now), 1)) throw new BadRequestException('A data final não pode estar no futuro');
  return { from: shiftDay(to, -(days - 1)), to, days };
}

/** Intervalos [from, to] de até `size` dias, em ordem, para buscar em lotes. */
export function* dayBatches(from: string, to: string, size = EXPORT_BATCH_DAYS): Generator<[string, string]> {
  for (let start = from; start <= to; start = shiftDay(start, size)) {
    const end = shiftDay(start, size - 1);
    yield [start, end < to ? end : to];
  }
}

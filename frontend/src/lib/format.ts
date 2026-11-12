const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export const fmtInt = (n: number) => int.format(Math.round(n));
export const fmtDec = (n: number) => dec.format(n);

/** Converte texto digitado ("12,5") em número; vazio vira 0. */
export function parseNum(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

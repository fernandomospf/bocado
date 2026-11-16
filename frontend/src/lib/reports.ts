import { fromISO } from './date';

const dayMonthShort = (iso: string, withMonth: boolean) =>
  new Intl.DateTimeFormat('pt-BR', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })
    .format(fromISO(iso))
    .replace('.', '');

/** "9 a 15 nov" ou, atravessando o mês, "30 nov a 6 dez". */
export function periodLabel(start: string, end: string) {
  const sameMonth = fromISO(start).getMonth() === fromISO(end).getMonth();
  return `${dayMonthShort(start, !sameMonth)} a ${dayMonthShort(end, true)}`;
}

/** Texto neutro do balanço versus uma referência: sem julgamento, só "abaixo" ou "acima". */
export function balanceText(kcal: number, reference: string) {
  const abs = Math.abs(Math.round(kcal)).toLocaleString('pt-BR');
  if (Math.abs(kcal) < 1) return `Igual ${reference}`;
  return `${abs} kcal ${kcal > 0 ? 'abaixo' : 'acima'} ${reference}`;
}

/** "+0,6 kg" / "−0,7 kg" (sinal tipográfico, uma casa). */
export function signedKg(kg: number) {
  const abs = Math.abs(kg).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return `${kg > 0 ? '+' : kg < 0 ? '−' : ''}${abs} kg`;
}

export const WEEKLY_DISCLAIMER =
  'Estimativas. O peso oscila com água e sal; olhe a tendência de várias semanas. Não substitui um nutricionista.';

export const weeklyDismissKey = (weekStart: string) => `bocado:weekly:dismissed:${weekStart}`;

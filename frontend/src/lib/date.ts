import type { WeekStart } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO() {
  return toISO(new Date());
}

export function fromISO(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function isValidISO(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(fromISO(value).getTime());
}

export function dayTitle(iso: string) {
  const today = todayISO();
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  // "terça-feira, 10 de nov." → "Terça, 10 de nov"
  const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })
    .format(fromISO(iso))
    .replace('-feira', '')
    .replace('.', '');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shortDay(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' }).format(fromISO(iso));
}

export function dayMonth(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
    .format(fromISO(iso))
    .replace('.', '');
}

/**
 * Primeiro dia da semana que contém `iso`. Única fonte da regra: tudo que agrupa por semana passa por aqui.
 * Feito sobre o calendário local (não UTC), então o horário de verão não desloca o resultado.
 */
export function weekStart(iso: string, weekStartsOn: WeekStart = 'MONDAY') {
  const first = weekStartsOn === 'SUNDAY' ? 0 : 1;
  const back = (fromISO(iso).getDay() - first + 7) % 7;
  return addDays(iso, -back);
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const shortWeekday = (iso: string) =>
  cap(new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(fromISO(iso)).replace('.', ''));

/** Rótulo curto de pílula: "Hoje", "Ontem", "Qui 13" (ou "Seg 2 nov" com `withMonth`). */
export function pillLabel(iso: string, today: string, withMonth = false) {
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, -1)) return 'Ontem';
  const d = fromISO(iso);
  const month = withMonth
    ? ` ${new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d).replace('.', '')}`
    : '';
  return `${shortWeekday(iso)} ${d.getDate()}${month}`;
}

/** Primeiro e último dia do mês de `iso`. */
export function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string) {
  const d = fromISO(monthStart(iso));
  return toISO(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Mesmo dia `n` meses depois, limitado ao fim do mês (31/jan + 1 → 28/fev). */
export function addMonths(iso: string, n: number) {
  const d = fromISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return toISO(new Date(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last)));
}

/** "novembro de 2026" → "Novembro de 2026". */
export function monthLabel(iso: string) {
  return cap(new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(fromISO(iso)));
}

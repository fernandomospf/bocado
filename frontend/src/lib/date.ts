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

/** Os 7 dias (ISO) da semana que contém `iso`, na ordem da preferência. */
export function weekDays(iso: string, weekStartsOn: WeekStart = 'MONDAY') {
  const start = weekStart(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

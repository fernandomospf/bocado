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
  const label = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' })
    .format(fromISO(iso))
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

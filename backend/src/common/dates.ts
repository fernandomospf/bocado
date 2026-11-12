export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Converte "YYYY-MM-DD" (dia local do usuário) para Date em UTC, compatível com colunas DATE. */
export function parseDay(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

export function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

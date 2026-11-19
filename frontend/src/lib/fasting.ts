/**
 * Jejum intermitente no app (puro, sem React). O Bocado só REGISTRA a janela que a pessoa escolhe: nada de "quebrou o
 * jejum", sequência ou cobrança. Encerrar antes da meta é normal. Horários guardados em UTC (ISO); exibidos no fuso do aparelho.
 */

export const FAST_PRESETS = [12, 14, 16, 18] as const;
export const DEFAULT_FAST_HOURS = 16;
export const FASTING_WARNING =
  'Jejum não é indicado para todo mundo. Se você está grávida, tem diabetes, usa medicamentos que afetam a glicose ou tem ou teve transtorno alimentar, converse com um profissional antes.';

export interface FastingSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  targetHours: number;
  note: string | null;
  durationMinutes: number | null;
}

const MIN_MS = 60_000;

/** "11h20", "16h", "35 min" (menos de 1 hora). */
export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / MIN_MS));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

export const elapsedMs = (startedAt: string, now: number) => now - new Date(startedAt).getTime();

/** "Janela de jejum · 11h20 de 16h" */
export const fastLine = (startedAt: string, targetHours: number, now: number) =>
  `Janela de jejum · ${fmtDuration(elapsedMs(startedAt, now))} de ${targetHours}h`;

/** "Jejum encerrado · 11h20" (sem cobrança por ter encerrado antes da meta). */
export const endedLine = (durationMinutes: number) => `Jejum encerrado · ${fmtDuration(durationMinutes * MIN_MS)}`;

/** Progresso neutro de 0 a 1 (passou da meta, a barra só fica cheia). */
export const fastProgress = (startedAt: string, targetHours: number, now: number) =>
  Math.min(1, Math.max(0, elapsedMs(startedAt, now) / (targetHours * 60 * MIN_MS)));

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO (UTC) → valor de <input type="datetime-local"> no fuso do aparelho. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> (fuso do aparelho) → ISO em UTC; null se inválido. */
export function fromLocalInput(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Modo GLP-1 no app (puro, sem React). O Bocado só registra e organiza; não orienta sobre a medicação, a dose nem o ciclo.
 * Tom sem culpa: comer menos que a meta não é problema aqui; o único aviso é o de segurança (ingestão bem baixa).
 */

export const GLP1_ABOUT =
  'Ajusta o app para quem usa medicamentos como tirzepatida ou semaglutida: foco em proteína, hidratação e em como você se sente. O Bocado não orienta sobre a medicação; siga o seu médico.';

export const GLP1_ADAPTIVE_PAUSED =
  'A meta adaptativa fica pausada enquanto o modo GLP-1 estiver ligado: parte da variação de peso vem da medicação e confundiria a estimativa do seu gasto.';

export const GLP1_REFERENCE_NOTE = 'O piso é uma referência geral (cerca de 1,2 g por kg de peso); ajuste como preferir.';

export const LOW_INTAKE_NOTE = 'Sua ingestão tem ficado bem baixa nos últimos dias. Vale conversar com seu médico ou nutricionista.';

export interface WellbeingScale {
  key: 'nausea' | 'appetite' | 'energy' | 'gi';
  title: string;
  /** Rótulo de cada nível, de 0 a 3. */
  labels: [string, string, string, string];
}

/** Rótulos adequados a cada escala (todos neutros, sem cor de julgamento). */
export const WELLBEING_SCALES: WellbeingScale[] = [
  { key: 'nausea', title: 'Náusea', labels: ['Nada', 'Leve', 'Moderada', 'Forte'] },
  { key: 'appetite', title: 'Apetite', labels: ['Nenhum', 'Baixo', 'Normal', 'Alto'] },
  { key: 'energy', title: 'Energia', labels: ['Baixa', 'Média', 'Boa', 'Alta'] },
  { key: 'gi', title: 'Intestino', labels: ['Tranquilo', 'Leve', 'Moderado', 'Forte'] },
];

const LEVEL_WORD = ['leve', 'moderada', 'forte'] as const;
const LEVEL_WORD_M = ['leve', 'moderado', 'forte'] as const;
const days = (n: number) => `${n} ${n === 1 ? 'dia' : 'dias'}`;

/** "Náusea leve em 2 dias, moderada em 1 dia" (null sem nenhum dia com náusea). */
function describe(prefix: string, counts: [number, number, number], words: readonly string[]): string | null {
  const parts = counts.flatMap((n, i) => (n > 0 ? [`${words[i]} em ${days(n)}`] : []));
  return parts.length ? `${prefix} ${parts.join(', ')}` : null;
}

/** Resumo neutro do bem-estar da semana, uma frase por escala com ocorrências. */
export function wellbeingSummaryLines(w: { loggedDays: number; nausea: [number, number, number]; gi: [number, number, number] }): string[] {
  const lines = [describe('Náusea', w.nausea, LEVEL_WORD), describe('Desconforto intestinal', w.gi, LEVEL_WORD_M)];
  const found = lines.filter((l): l is string => l !== null);
  return found.length ? found : [`Bem-estar anotado em ${days(w.loggedDays)}, sem náusea nem desconforto.`];
}

export const LOW_INTAKE_SEEN_KEY = 'bocado:glp1:lowIntakeSeen';
const WEEK_MS = 7 * 86_400_000;

/** O aviso de baixa ingestão aparece uma vez por semana, no máximo: `lastShown` = dia (YYYY-MM-DD) da última exibição. */
export function lowIntakeDue(lastShown: string | null, today: string): boolean {
  if (!lastShown) return true;
  const gap = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastShown}T00:00:00Z`);
  return Number.isNaN(gap) || gap >= WEEK_MS;
}

/** Fica visível durante o dia em que foi mostrado (para não sumir ao navegar) e volta só depois de 7 dias. */
export function lowIntakeVisible(lastShown: string | null, today: string): boolean {
  return lastShown === today || lowIntakeDue(lastShown, today);
}

export const DOSE_DAY_TEXT = (n: number) => `Dia ${n} desde a última aplicação`;

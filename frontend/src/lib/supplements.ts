/**
 * Suplementos e medicações (puro, testável). O app SÓ REGISTRA o que a pessoa informa: nada aqui recomenda, calcula,
 * valida faixa de dose nem converte unidades. A dose é mostrada exatamente como foi digitada.
 * Tom sem culpa: dose sem registro é "Não registrada" (nunca "esquecida", "atrasada" ou "perdida"); sem sequências
 * nem percentuais de adesão. Roda com: npm test (supplements.test.mjs)
 */
import type { Administration, DoseUnit, InjectionSite, ScheduleType, Slot, SupplementCategory, SupplementItem, SupplementPlan } from './types';

/** Texto fixo da tela de ativação e do editor. */
export const SUPPLEMENTS_PRINCIPLES =
  'O Bocado registra o que você informa. Ele não recomenda, calcula nem ajusta doses. Para orientações sobre medicações, converse com seu médico ou farmacêutico.';
export const SUPPLEMENTS_PRIVACY = 'Só você vê. Não aparece na casa, nos relatórios nem em exportações, a menos que você inclua.';
export const CALENDAR_NOTICE = 'Arquivos de calendário ficam no seu aparelho, fora do Bocado.';
export const DOSE_HISTORY_NOTE = 'Mudar a dose vale daqui para frente: os registros antigos continuam com a dose da época.';

export const MAX_ACTIVE_PLANS = 30;

export const CATEGORIES: { value: SupplementCategory; label: string }[] = [
  { value: 'MEDICATION', label: 'Medicação' },
  { value: 'SUPPLEMENT', label: 'Suplemento' },
  { value: 'VITAMIN', label: 'Vitamina' },
  { value: 'OTHER', label: 'Outro' },
];

export const ADMINISTRATIONS: { value: Administration; label: string }[] = [
  { value: 'ORAL', label: 'Oral' },
  { value: 'INJECTION', label: 'Injetável' },
  { value: 'OTHER', label: 'Outro' },
];

export const DOSE_UNITS: { value: DoseUnit; label: string }[] = [
  { value: 'ML', label: 'ml' },
  { value: 'MG', label: 'mg' },
  { value: 'MCG', label: 'mcg' },
  { value: 'G', label: 'g' },
  { value: 'UI', label: 'UI' },
  { value: 'TABLET', label: 'comprimido' },
  { value: 'CAPSULE', label: 'cápsula' },
  { value: 'SCOOP', label: 'dose/scoop' },
  { value: 'DROP', label: 'gotas' },
  { value: 'OTHER', label: 'Outro' },
];

export const SLOTS: { value: Exclude<Slot, 'ANY'>; label: string }[] = [
  { value: 'MORNING', label: 'Manhã' },
  { value: 'AFTERNOON', label: 'Tarde' },
  { value: 'NIGHT', label: 'Noite' },
];
const SLOT_ORDER: Slot[] = ['ANY', 'MORNING', 'AFTERNOON', 'NIGHT'];

/** Locais de aplicação, na ordem do rodízio (só um ciclo de conveniência, sem orientação clínica). */
export const SITES: { value: InjectionSite; label: string }[] = [
  { value: 'ABDOMEN_L', label: 'Abdômen esquerdo' },
  { value: 'ABDOMEN_R', label: 'Abdômen direito' },
  { value: 'THIGH_L', label: 'Coxa esquerda' },
  { value: 'THIGH_R', label: 'Coxa direita' },
  { value: 'GLUTE_L', label: 'Glúteo esquerdo' },
  { value: 'GLUTE_R', label: 'Glúteo direito' },
  { value: 'DELTOID_L', label: 'Deltoide esquerdo' },
  { value: 'DELTOID_R', label: 'Deltoide direito' },
  { value: 'OTHER', label: 'Outro' },
];

/** Seg a Dom (com o número do dia: 0 = domingo … 6 = sábado). */
export const WEEKDAY_CHIPS = [
  { day: 1, short: 'Seg', long: 'segunda' },
  { day: 2, short: 'Ter', long: 'terça' },
  { day: 3, short: 'Qua', long: 'quarta' },
  { day: 4, short: 'Qui', long: 'quinta' },
  { day: 5, short: 'Sex', long: 'sexta' },
  { day: 6, short: 'Sáb', long: 'sábado' },
  { day: 0, short: 'Dom', long: 'domingo' },
] as const;

export const siteLabel = (site: InjectionSite) => SITES.find((s) => s.value === site)?.label ?? 'Outro';
export const slotLabel = (slot: Slot) => (slot === 'ANY' ? '' : (SLOTS.find((s) => s.value === slot)?.label ?? ''));

/** Dose digitada: aceita vírgula ("0,5"); vazio ou inválido = null. Sem arredondar nada. */
export function parseDose(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Só a regra do servidor, para o botão Salvar: maior que zero e até 100000. Nenhuma faixa por medicamento. */
export const doseIsValid = (n: number | null): n is number => n !== null && n > 0 && n <= 100_000;

const unitText = (unit: DoseUnit, label: string | null | undefined) =>
  unit === 'OTHER' ? (label ?? '').trim() : (DOSE_UNITS.find((u) => u.value === unit)?.label ?? '');

/** "0,5 ml" / "8 gotas": exatamente o que a pessoa digitou. */
export function doseText(amount: number, unit: DoseUnit, label: string | null | undefined): string {
  return `${String(amount).replace('.', ',')} ${unitText(unit, label)}`.trim();
}

/** "0,5 ml · Manhã" (sem horário = só a dose). */
export function doseLine(item: Pick<SupplementItem, 'doseAmount' | 'doseUnit' | 'doseUnitLabel' | 'slot'>): string {
  const slot = slotLabel(item.slot);
  return slot ? `${doseText(item.doseAmount, item.doseUnit, item.doseUnitLabel)} · ${slot}` : doseText(item.doseAmount, item.doseUnit, item.doseUnitLabel);
}

/** O verbo do botão principal: "Apliquei" para injetáveis, "Tomei" para o resto. */
export const verbFor = (administration: Administration) => (administration === 'INJECTION' ? 'Apliquei' : 'Tomei');

// --- nomes genéricos ("Mostrar nomes na tela Hoje" desligado) --------------------------------------

/** "Medicação 1", "Suplemento 2": a posição vem da ordem de cadastro entre os itens ativos. Só na Hoje e no gráfico. */
export function genericNames(plans: Pick<SupplementPlan, 'id' | 'category' | 'archived' | 'createdAt'>[]): Map<string, string> {
  const active = plans.filter((p) => !p.archived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return new Map(active.map((p, i) => [p.id, `${p.category === 'MEDICATION' ? 'Medicação' : 'Suplemento'} ${i + 1}`]));
}

/** Nome mostrado numa tela que respeita a máscara; sem máscara, o nome real. */
export function displayName(plan: { id: string; name: string }, masked: boolean, generic: Map<string, string>): string {
  return masked ? (generic.get(plan.id) ?? 'Suplemento') : plan.name;
}

// --- frequência e próxima dose ---------------------------------------------------------------------

/** "Todo dia", "Seg, qui", "A cada 7 dias", com os horários ("Manhã e noite"). */
export function frequencyText(p: Pick<SupplementPlan, 'scheduleType' | 'weekdays' | 'intervalDays' | 'slots'>): string {
  const base =
    p.scheduleType === 'DAILY'
      ? 'Todo dia'
      : p.scheduleType === 'WEEKDAYS'
        ? WEEKDAY_CHIPS.filter((w) => p.weekdays.includes(w.day))
            .map((w, i) => (i === 0 ? w.short : w.short.toLowerCase()))
            .join(', ')
        : `A cada ${p.intervalDays ?? '?'} dias`;
  const slots = SLOT_ORDER.filter((s) => s !== 'ANY' && p.slots.includes(s)).map((s) => slotLabel(s).toLowerCase());
  if (slots.length === 0) return base;
  const when = slots.length === 1 ? slots[0] : `${slots.slice(0, -1).join(', ')} e ${slots[slots.length - 1]}`;
  return `${base} · ${when}`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Dia da semana curto de uma data "YYYY-MM-DD" ("seg"), sem fuso (meio-dia local). */
export const weekdayShort = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(new Date(y, m - 1, d, 12)).replace('.', '');
};

/** "hoje", "amanhã" ou o dia da semana ("seg"). */
export function whenText(date: string, today: string): string {
  const [y, m, d] = today.split('-').map(Number);
  const tomorrow = new Date(y, m - 1, d + 1, 12);
  const iso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  if (date === today) return 'hoje';
  if (date === iso) return 'amanhã';
  return weekdayShort(date);
}

/** Linha de próxima dose do rodapé da Hoje: "Próxima: Medicação 1 · seg". */
export const nextLine = (name: string, date: string, today: string) => `Próxima: ${name} · ${whenText(date, today)}`;

// --- o dia -----------------------------------------------------------------------------------------

/** Itens do dia mostrado × pendências dos dias anteriores (a janela de 3 dias vem pronta do servidor). */
export function splitItems(items: SupplementItem[], date: string) {
  return {
    today: items.filter((i) => i.dueDate === date),
    earlier: items.filter((i) => i.dueDate < date && i.status === 'unlogged'),
  };
}

/** "Não registrada · seg": em tom neutro, nunca em vermelho. */
export const unloggedLabel = (dueDate: string) => `Não registrada · ${weekdayShort(dueDate)}`;

/** "2 de 3 registrados" (pulado conta como resolvido no dia, mas não como "registrado"). Sem itens no dia: vazio. */
export function progressSummary(items: SupplementItem[], date: string, short = false): string {
  const today = items.filter((i) => i.dueDate === date);
  if (today.length === 0) return '';
  const done = today.filter((i) => i.status === 'taken').length;
  return short ? `${done} de ${today.length}` : `${done} de ${today.length} ${today.length === 1 ? 'registrado' : 'registrados'}`;
}

/** Aberto por padrão só se houver item pendente (hoje ou nos dias anteriores). O estado manual vale sobre isto. */
export const hasPending = (items: SupplementItem[]) => items.some((i) => i.status === 'pending' || i.status === 'unlogged');

/** Horário "08:30" de um instante ISO, no fuso do aparelho. */
export function timeText(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Data local "YYYY-MM-DD" + hora "HH:MM" → instante ISO (o fuso é o do aparelho). */
export function localToISO(date: string, hhmm: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).toISOString();
}

/** Plano ativo é o que não está arquivado. */
export const activePlans = (plans: SupplementPlan[] | undefined) => (plans ?? []).filter((p) => !p.archived);
export const archivedPlans = (plans: SupplementPlan[] | undefined) => (plans ?? []).filter((p) => p.archived);

export type ScheduleKind = ScheduleType;

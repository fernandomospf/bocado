import type { InjectionSite, ScheduleType, Slot } from '@prisma/client';
import { weekdayOf } from '../reports/weekly.math';
import { addDays, dayNumber } from '../weight/weight.math';

/**
 * Agenda dos suplementos e medicações (puro, testável). Datas locais "YYYY-MM-DD", sem fuso no servidor.
 * O app só REGISTRA o que a pessoa informa: nada aqui recomenda, calcula ou valida dose.
 */

/** Pendências: itens previstos nos últimos 3 dias sem registro aparecem como "Não registrada"; os mais antigos só no histórico. */
export const PENDING_WINDOW_DAYS = 3;
export const MAX_ACTIVE_PLANS = 30;
export const MAX_LOG_AGE_DAYS = 30;

export interface PlanSchedule {
  scheduleType: ScheduleType;
  /** 0 = domingo … 6 = sábado. */
  weekdays: number[];
  /** 2 a 90. */
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
}

/** O último registro (TAKEN ou SKIPPED) do plano ANTES do dia avaliado; só a data importa. */
export interface LastLog {
  date: string;
}

/**
 * Dia previsto do EVERY_N_DAYS ("rolling"): a data do último registro + N dias, ou a data de início se ainda não houver
 * registro. A dose atrasada NÃO empurra a agenda sozinha: quem define a próxima é o registro (ou o "pular").
 */
function rollingAnchor(plan: PlanSchedule, lastLog: LastLog | null): string | null {
  const n = plan.intervalDays;
  if (!n || n < 1) return null;
  const anchor = lastLog ? addDays(lastLog.date, n) : plan.startDate;
  return anchor < plan.startDate ? plan.startDate : anchor;
}

/** O plano prevê uma dose neste dia? (Cada horário do plano gera um item por dia previsto.) */
export function dueOn(plan: PlanSchedule, date: string, lastLog: LastLog | null = null): boolean {
  if (date < plan.startDate) return false;
  if (plan.endDate && date > plan.endDate) return false;
  switch (plan.scheduleType) {
    case 'DAILY':
      return true;
    case 'WEEKDAYS':
      return plan.weekdays.includes(weekdayOf(date));
    case 'EVERY_N_DAYS':
      return rollingAnchor(plan, lastLog) === date;
    default:
      return false;
  }
}

/**
 * Próxima data prevista a partir de `fromDate` (inclusive), ou null se o plano já terminou.
 * EVERY_N_DAYS: projeta a partir da data prevista atual (como se cada dose fosse feita no dia previsto), então uma dose
 * ainda não registrada não faz o rodapé dizer "amanhã". Limitação: a agenda real (rolling) segue o que a pessoa registrar.
 */
export function nextDue(plan: PlanSchedule, fromDate: string, lastLog: LastLog | null = null): string | null {
  const from = fromDate < plan.startDate ? plan.startDate : fromDate;
  const within = (d: string) => (plan.endDate && d > plan.endDate ? null : d);
  switch (plan.scheduleType) {
    case 'DAILY':
      return within(from);
    case 'WEEKDAYS': {
      if (plan.weekdays.length === 0) return null;
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i);
        if (plan.weekdays.includes(weekdayOf(d))) return within(d);
      }
      return null;
    }
    case 'EVERY_N_DAYS': {
      const anchor = rollingAnchor(plan, lastLog);
      const n = plan.intervalDays;
      if (anchor === null || !n) return null;
      if (anchor >= from) return within(anchor);
      const steps = Math.ceil((dayNumber(from) - dayNumber(anchor)) / n);
      return within(addDays(anchor, steps * n));
    }
    default:
      return null;
  }
}

/**
 * Ordem fixa de rodízio dos locais de aplicação. É só um ciclo de conveniência, sem nenhuma orientação clínica:
 * o app não sabe qual local é adequado para ninguém, e a pessoa escolhe o que quiser.
 */
export const SITE_CYCLE: InjectionSite[] = [
  'ABDOMEN_L',
  'ABDOMEN_R',
  'THIGH_L',
  'THIGH_R',
  'GLUTE_L',
  'GLUTE_R',
  'DELTOID_L',
  'DELTOID_R',
];

/** O local seguinte ao último usado (por data; em empate vale o último da lista). Sem histórico, o primeiro do ciclo. */
export function suggestedSite(history: { date: string; site: InjectionSite | null }[]): InjectionSite {
  let last: InjectionSite | null = null;
  let lastDate = '';
  for (const h of history) {
    if (h.site && h.date >= lastDate) {
      last = h.site;
      lastDate = h.date;
    }
  }
  const i = last ? SITE_CYCLE.indexOf(last) : -1;
  return SITE_CYCLE[(i + 1) % SITE_CYCLE.length];
}

/** As 4 datas da janela de pendências de um dia: [date − 3 … date], em ordem. */
export function windowDates(date: string): string[] {
  return Array.from({ length: PENDING_WINDOW_DAYS + 1 }, (_, i) => addDays(date, i - PENDING_WINDOW_DAYS));
}

/** Horários do plano: sem nenhum, "qualquer hora"; "qualquer hora" não convive com os outros. */
export function normalizeSlots(slots: Slot[] | undefined): Slot[] {
  const unique = [...new Set(slots ?? [])];
  const specific = unique.filter((s) => s !== 'ANY');
  return specific.length > 0 ? specific : ['ANY'];
}

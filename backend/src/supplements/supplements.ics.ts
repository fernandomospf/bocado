import type { DoseUnit, ScheduleType } from '@prisma/client';
import { weekdayOf } from '../reports/weekly.math';
import { addDays } from '../weight/weight.math';
import { doseText } from './supplements.format';

/**
 * Arquivo de calendário (.ics) de UM plano, gerado na hora e entregue só ao dono (autenticado, sem URL pública, sem
 * token e sem feed de assinatura). O evento usa horário "flutuante" (hora local, sem TZID): vale no fuso de quem abrir.
 *
 * Privacidade: o título padrão é genérico ("Lembrete do Bocado"); nome e dose só entram por escolha explícita.
 * Limitação: no "a cada N dias" o app conta a partir do último registro (rolling), então o calendário (intervalo fixo)
 * pode divergir se a dose atrasar.
 */

export const GENERIC_TITLE = 'Lembrete do Bocado';
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export interface IcsPlan {
  id: string;
  name: string;
  scheduleType: ScheduleType;
  weekdays: number[];
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel: string | null;
}

export interface IcsOptions {
  /** "HH:MM". */
  time: string;
  title: 'generic' | 'name';
  /** Opt-in explícito (padrão desligado). */
  includeDose: boolean;
  now?: Date;
}

/** Escape de texto do iCalendar (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Dobra linhas em 75 octetos (sem cortar caractere de vários bytes). */
export function fold(line: string): string {
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // a continuação começa com um espaço
    }
    cur += ch;
    bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const compact = (iso: string) => iso.replace(/-/g, '');

/** Primeira data do evento: a de início ou, em "Dias da semana", o primeiro dia listado a partir dela. */
export function firstOccurrence(plan: Pick<IcsPlan, 'scheduleType' | 'weekdays' | 'startDate'>): string {
  if (plan.scheduleType !== 'WEEKDAYS' || plan.weekdays.length === 0) return plan.startDate;
  for (let i = 0; i < 7; i++) {
    const d = addDays(plan.startDate, i);
    if (plan.weekdays.includes(weekdayOf(d))) return d;
  }
  return plan.startDate;
}

export function rruleFor(plan: IcsPlan): string {
  let rule: string;
  switch (plan.scheduleType) {
    case 'DAILY':
      rule = 'FREQ=DAILY';
      break;
    case 'WEEKDAYS':
      rule = `FREQ=WEEKLY;BYDAY=${[...plan.weekdays].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_CODES[d]).join(',')}`;
      break;
    default:
      rule = `FREQ=DAILY;INTERVAL=${plan.intervalDays ?? 1}`;
  }
  // UNTIL no mesmo formato do DTSTART (flutuante, sem Z): vale até o fim do último dia
  return plan.endDate ? `${rule};UNTIL=${compact(plan.endDate)}T235959` : rule;
}

export function buildIcs(plan: IcsPlan, opts: IcsOptions): string {
  const [hh, mm] = opts.time.split(':');
  const start = `${compact(firstOccurrence(plan))}T${hh}${mm}00`;
  const stamp = (opts.now ?? new Date()).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const base = opts.title === 'name' ? plan.name : GENERIC_TITLE;
  const title = opts.includeDose ? `${base} · ${doseText(plan.doseAmount, plan.doseUnit, plan.doseUnitLabel)}` : base;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Bocado//Lembrete//PT',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${plan.id}@bocado`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `RRULE:${rruleFor(plan)}`,
    `SUMMARY:${escapeText(title)}`,
    'DESCRIPTION:Registre no Bocado.',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Registre no Bocado.',
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

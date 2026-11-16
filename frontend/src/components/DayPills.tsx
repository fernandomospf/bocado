'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { addDays, fromISO, pillLabel } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useDay } from '@/lib/hooks';
import type { RangeSummary, WeekStart } from '@/lib/types';
import { CalendarSheet } from './CalendarSheet';
import { CalendarIcon } from './Icons';
import { MiniRing } from './MiniRing';

interface DayPillsProps {
  /** Dia selecionado (ISO). */
  date: string;
  today: string;
  weekStartsOn: WeekStart;
  onSelect: (iso: string) => void;
}

const longLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Anteontem, ontem e hoje como pílulas (com mini anel de calorias ou, sem calorias, de proteína) + calendário para os demais dias.
 * Se o dia aberto for mais antigo, ele aparece numa quarta pílula à esquerda, para a pessoa saber onde está.
 */
export function DayPills({ date, today, weekStartsOn, onSelect }: DayPillsProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const { hideCalories: hide } = useDisplayPrefs();
  const from = addDays(today, -2);
  const recent = [from, addDays(today, -1), today];
  const older = date < from;

  const { data: range } = useSWR<RangeSummary>(`/days?from=${from}&to=${today}`);
  // Dia antigo: mesmo cache da TodayView (sem requisição extra)
  const { data: olderDay } = useDay(older ? date : today);

  // Sem calorias, o mini anel de cada dia acompanha a proteína
  const metric = hide ? 'protein' : 'kcal';
  const target = range?.targets?.[metric] ?? 0;
  const kcalOf = (iso: string) =>
    older && iso === date ? (olderDay?.totals[metric] ?? 0) : (range?.days.find((d) => d.date === iso)?.totals[metric] ?? 0);

  const select = (iso: string) => {
    if (iso === date) return;
    tap();
    onSelect(iso);
  };

  const pill = (iso: string, isOlder = false) => {
    const kcal = kcalOf(iso);
    const unit = hide ? 'g de proteína' : 'kcal';
    const detail = target ? `${fmtInt(kcal)} de ${fmtInt(target)} ${unit}` : `${fmtInt(kcal)} ${unit}`;
    return (
      <button
        key={iso}
        type="button"
        className={isOlder ? 'day-pill day-pill-older' : 'day-pill'}
        aria-pressed={iso === date}
        aria-current={iso === today ? 'date' : undefined}
        aria-label={`${iso === today ? 'Hoje, ' : iso === addDays(today, -1) ? 'Ontem, ' : ''}${longLabel.format(fromISO(iso))}: ${detail}`}
        onClick={() => select(iso)}
      >
        <span className="day-pill-label" aria-hidden>
          {isOlder ? (
            // "Ter 10 nov" não cabe numa linha com 4 pílulas: quebra entre o dia da semana e a data
            <>
              <span>{pillLabel(iso, today, true).split(' ')[0]}</span>{' '}
              <span>{pillLabel(iso, today, true).split(' ').slice(1).join(' ')}</span>
            </>
          ) : (
            pillLabel(iso, today)
          )}
        </span>
        <MiniRing value={kcal} target={target} tone={hide ? 'protein' : 'kcal'} />
      </button>
    );
  };

  return (
    <nav className="day-pills" aria-label="Dias">
      {older && pill(date, true)}
      {recent.map((iso) => pill(iso))}
      <button
        type="button"
        className="day-pills-calendar"
        aria-label="Escolher dia"
        aria-haspopup="dialog"
        onClick={() => {
          tap();
          setCalendarOpen(true);
        }}
      >
        <CalendarIcon width={22} height={22} />
      </button>

      {calendarOpen && (
        <CalendarSheet
          date={date}
          today={today}
          weekStartsOn={weekStartsOn}
          onClose={() => setCalendarOpen(false)}
          onSelect={(iso) => {
            setCalendarOpen(false);
            select(iso);
          }}
        />
      )}
    </nav>
  );
}

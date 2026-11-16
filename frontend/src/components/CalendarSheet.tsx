'use client';

import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import useSWR from 'swr';
import { addDays, addMonths, fromISO, monthEnd, monthLabel, monthStart, weekStart } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import type { RangeSummary, WeekStart } from '@/lib/types';
import { ChevronLeft, ChevronRight } from './Icons';
import { Sheet } from './Sheet';

interface CalendarSheetProps {
  date: string;
  today: string;
  weekStartsOn: WeekStart;
  onClose: () => void;
  onSelect: (iso: string) => void;
}

const dayName = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });
const dayNarrow = new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' });
const fullLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Dentro de ±10% da meta conta como "na meta" (ponto verde-neutro); fora disso, ponto cinza. Sem vermelho. */
export function dayStatus(kcal: number, target: number): 'on' | 'off' {
  return target > 0 && Math.abs(kcal - target) <= target * 0.1 ? 'on' : 'off';
}

/**
 * Calendário mensal numa Sheet. Grade acessível (role="grid"): setas movem o foco entre os dias (trocando de mês
 * quando preciso), Home/End vão ao início/fim da semana, PageUp/PageDown trocam o mês, Enter seleciona, Esc fecha.
 */
export function CalendarSheet({ date, today, weekStartsOn, onClose, onSelect }: CalendarSheetProps) {
  const id = useId();
  // Dia com o foco (roving tabindex); o mês exibido é sempre o dele
  const [focus, setFocus] = useState(date);
  const grid = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const first = monthStart(focus);
  const last = monthEnd(focus);
  const isCurrentMonth = first === monthStart(today);
  const to = last < today ? last : today;
  const { data } = useSWR<RangeSummary>(`/days?from=${first}&to=${to}`);
  const target = data?.targets?.kcal ?? 0;
  const logged = new Map(data?.days.map((d) => [d.date, d.totals.kcal]) ?? []);
  const { data: workoutData } = useSWR<{ workouts: { date: string }[] }>(`/workouts?from=${first}&to=${to}`, { revalidateOnFocus: false });
  const trainedDays = new Set(workoutData?.workouts.map((w) => w.date));

  // Semanas do mês, começando conforme a preferência; dias de outros meses ficam vazios
  const gridStart = weekStart(first, weekStartsOn);
  const weeks: string[][] = [];
  for (let d = gridStart; d <= last; d = addDays(d, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(d, i)));
  }
  const headers = weeks[0];

  // Depois de mover pelo teclado, leva o foco ao botão do novo dia (inclusive após trocar de mês)
  useEffect(() => {
    if (!moved.current) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [focus]);

  const clamp = (iso: string) => (iso > today ? today : iso);
  const moveTo = (iso: string) => {
    moved.current = true;
    setFocus(clamp(iso));
  };

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dow = (fromISO(focus).getDay() - (weekStartsOn === 'SUNDAY' ? 0 : 1) + 7) % 7;
    const keys: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      Home: () => addDays(focus, -dow),
      End: () => addDays(focus, 6 - dow),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
    };
    const next = keys[e.key];
    if (!next) return;
    e.preventDefault();
    moveTo(next());
  }

  const choose = (iso: string) => {
    if (iso > today) return;
    onSelect(iso);
  };

  return (
    <Sheet open title="Escolher dia" onClose={onClose}>
      <div className="calendar stack">
        <div className="spread">
          <h2 className="title">Escolher dia</h2>
          <button type="button" className="btn btn-glass btn-sm" onClick={() => choose(today)} disabled={date === today}>
            Hoje
          </button>
        </div>

        <div className="calendar-nav">
          <button
            type="button"
            className="btn btn-glass btn-icon"
            aria-label="Mês anterior"
            onClick={() => {
              tap();
              setFocus(addMonths(focus, -1));
            }}
          >
            <ChevronLeft width={20} height={20} />
          </button>
          <p className="headline" id={`${id}-month`} aria-live="polite">
            {monthLabel(first)}
          </p>
          <button
            type="button"
            className="btn btn-glass btn-icon"
            aria-label="Próximo mês"
            disabled={isCurrentMonth}
            onClick={() => {
              tap();
              setFocus(clamp(addMonths(focus, 1)));
            }}
          >
            <ChevronRight width={20} height={20} />
          </button>
        </div>

        <div ref={grid} className="calendar-grid" role="grid" aria-labelledby={`${id}-month`} onKeyDown={onKeyDown}>
          <div role="row" className="calendar-row">
            {headers.map((d) => (
              <span key={d} role="columnheader" className="calendar-dow" aria-label={dayName.format(fromISO(d))}>
                {dayNarrow.format(fromISO(d)).toUpperCase()}
              </span>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="calendar-row">
              {week.map((d) => {
                if (d < first || d > last) return <span key={d} role="gridcell" className="calendar-cell" />;
                const future = d > today;
                const kcal = logged.get(d);
                const status = kcal !== undefined ? dayStatus(kcal, target) : null;
                const label = [
                  d === today ? 'Hoje, ' : '',
                  fullLabel.format(fromISO(d)),
                  kcal !== undefined ? `: ${fmtInt(kcal)} kcal${status === 'on' ? ', dentro da meta' : ''}` : '',
                  trainedDays.has(d) ? ', com treino' : '',
                ].join('');
                return (
                  <span key={d} role="gridcell" className="calendar-cell" aria-selected={d === date}>
                    <button
                      type="button"
                      className="calendar-day"
                      data-date={d}
                      data-today={d === today || undefined}
                      data-status={status ?? undefined}
                      aria-current={d === today ? 'date' : undefined}
                      aria-pressed={d === date}
                      aria-label={label}
                      tabIndex={d === focus ? 0 : -1}
                      disabled={future}
                      onFocus={() => setFocus(d)}
                      onClick={() => choose(d)}
                    >
                      <span aria-hidden>{fromISO(d).getDate()}</span>
                      {trainedDays.has(d) && <i className="workout-dot" aria-hidden />}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <div className="calendar-legend caption" aria-hidden>
          <span>
            <i data-status="on" /> Dentro da meta (±10%)
          </span>
          <span>
            <i data-status="off" /> Com registro
          </span>
          <span>
            <i className="workout-dot workout-dot-static" /> Com treino
          </span>
        </div>
      </div>
    </Sheet>
  );
}

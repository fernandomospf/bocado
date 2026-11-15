'use client';

import useSWR from 'swr';
import { addDays, fromISO, shortDay, weekDays } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import type { RangeSummary, WeekStart } from '@/lib/types';
import { ChevronLeft, ChevronRight } from './Icons';

interface WeekStripProps {
  /** Dia selecionado (ISO). */
  date: string;
  today: string;
  weekStartsOn: WeekStart;
  onSelect: (iso: string) => void;
}

const longLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * Faixa com os 7 dias da semana do dia selecionado: letra, número e um mini anel de calorias.
 * Uma requisição por semana (`/days?from=&to=`): a chave do SWR muda só ao trocar de semana.
 */
export function WeekStrip({ date, today, weekStartsOn, onSelect }: WeekStripProps) {
  const days = weekDays(date, weekStartsOn);
  const from = days[0];
  const to = days[6];
  const { data } = useSWR<RangeSummary>(`/days?from=${from}&to=${to}`);
  const byDate = new Map(data?.days.map((d) => [d.date, d.totals.kcal]) ?? []);
  const target = data?.targets?.kcal ?? 0;

  const select = (iso: string) => {
    if (iso === date || iso > today) return;
    tap();
    onSelect(iso);
  };

  const nextWeekStart = addDays(from, 7);

  return (
    <nav className="week-strip" aria-label="Semana">
      <button
        type="button"
        className="week-arrow"
        onClick={() => select(addDays(date, -7))}
        aria-label="Semana anterior"
      >
        <ChevronLeft width={18} height={18} />
      </button>

      <ol className="week-days">
        {days.map((iso) => {
          const kcal = byDate.get(iso) ?? 0;
          const future = iso > today;
          const selected = iso === date;
          const isToday = iso === today;
          const name = longLabel.format(fromISO(iso));
          const detail = future
            ? ''
            : target
              ? `: ${fmtInt(kcal)} de ${fmtInt(target)} kcal`
              : kcal
                ? `: ${fmtInt(kcal)} kcal`
                : '';
          return (
            <li key={iso}>
              <button
                type="button"
                className="week-day"
                onClick={() => select(iso)}
                disabled={future}
                aria-pressed={selected}
                aria-current={isToday ? 'date' : undefined}
                aria-label={`${isToday ? 'Hoje, ' : ''}${name}${detail}`}
              >
                <span className="week-day-letter" aria-hidden>
                  {shortDay(iso)}
                </span>
                <MiniRing value={kcal} target={target} />
                <span className="week-day-num num" aria-hidden>
                  {fromISO(iso).getDate()}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <button
        type="button"
        className="week-arrow"
        // Próxima semana: mesmo dia da semana, sem passar de hoje
        onClick={() => select(addDays(date, 7) > today ? today : addDays(date, 7))}
        disabled={nextWeekStart > today}
        aria-label="Próxima semana"
      >
        <ChevronRight width={18} height={18} />
      </button>
    </nav>
  );
}

/** Anel de 28px só com calorias. Acima da meta fica cheio. */
function MiniRing({ value, target }: { value: number; target: number }) {
  const size = 28;
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <svg className="week-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="week-ring-track" />
      {pct > 0.01 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="week-ring-fill"
        />
      )}
    </svg>
  );
}

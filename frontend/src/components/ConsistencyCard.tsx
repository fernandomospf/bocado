'use client';

import useSWR from 'swr';
import { addDays, weekStart } from '@/lib/date';
import { useWeekStartsOn } from '@/lib/hooks';
import type { RangeSummary } from '@/lib/types';

/** Dias seguidos com registro, terminando hoje (ou ontem, se hoje ainda não tem registro). Sem cobrança. */
export function currentStreak(loggedDates: Set<string>, today: string): number {
  let day = loggedDates.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (loggedDates.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** "Constância" (modo sem calorias): dias registrados na semana e sequência atual, em tom neutro. */
export function ConsistencyCard({ today }: { today: string }) {
  const weekStartsOn = useWeekStartsOn();
  const from = addDays(today, -59);
  const { data } = useSWR<RangeSummary>(`/days?from=${from}&to=${today}`);
  if (!data) return <div className="skeleton" style={{ height: 76 }} />;

  const logged = new Set(data.days.map((d) => d.date));
  const start = weekStart(today, weekStartsOn);
  const thisWeek = [...logged].filter((d) => d >= start && d <= today).length;
  const streak = currentStreak(logged, today);

  return (
    <section className="card glass stack-sm" aria-label="Constância">
      <h2 className="headline">Constância</h2>
      <p className="body-2 num">{thisWeek} de 7 dias registrados nesta semana</p>
      {streak > 0 && (
        <p className="caption num">
          Sequência atual: {streak} {streak === 1 ? 'dia' : 'dias'}
        </p>
      )}
    </section>
  );
}

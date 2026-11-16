'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtInt } from '@/lib/format';
import { balanceText, periodLabel, weeklyDismissKey } from '@/lib/reports';
import type { WeeklyListItem, WeeklyReport } from '@/lib/types';
import { CloseIcon } from './Icons';
import { WeeklyReportSheet } from './WeeklyReportSheet';

/**
 * "Sua semana": aparece só no dia de hoje, quando o servidor aponta uma semana para destacar e a pessoa ainda não a
 * dispensou. Hora e dispensa ficam no navegador (a página é pré-renderizada, e o servidor não conhece o fuso).
 */
export function WeeklyCard({ today, isToday }: { today: string; isToday: boolean }) {
  const [hour, setHour] = useState<number | null>(null);
  const [dismissedWeek, setDismissedWeek] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { hideCalories: hide } = useDisplayPrefs();

  useEffect(() => setHour(new Date().getHours()), []);

  const { data: pending } = useSWR<WeeklyListItem | null>(
    isToday && hour !== null ? `/reports/weekly/pending?today=${today}&hour=${hour}` : null,
    { revalidateOnFocus: false },
  );
  const weekStart = pending?.weekStart ?? null;

  useEffect(() => {
    if (weekStart) setDismissedWeek(localStorage.getItem(weeklyDismissKey(weekStart)) === '1' ? weekStart : null);
  }, [weekStart]);

  const { data: report } = useSWR<WeeklyReport>(weekStart ? `/reports/weekly?week=${weekStart}` : null, {
    revalidateOnFocus: false,
  });

  if (!pending || !weekStart || dismissedWeek === weekStart) return null;

  const dismiss = () => {
    localStorage.setItem(weeklyDismissKey(weekStart), '1');
    setDismissedWeek(weekStart);
  };

  return (
    <>
      <section className="card glass stack-sm weekly-card" aria-label="Sua semana">
        <div className="spread">
          <div>
            <h2 className="headline">Sua semana</h2>
            <p className="caption">{periodLabel(pending.weekStart, pending.weekEnd)}</p>
          </div>
          <button type="button" className="btn btn-plain btn-icon" onClick={dismiss} aria-label="Dispensar relatório da semana">
            <CloseIcon width={18} height={18} />
          </button>
        </div>

        <div className="weekly-dots" role="img" aria-label={`${pending.loggedDays} de 7 dias registrados`}>
          {(report?.days ?? Array.from({ length: 7 }, (_, i) => ({ date: String(i), logged: i < pending.loggedDays }))).map((d) => (
            <span key={d.date} className="weekly-dot" data-on={d.logged || undefined} />
          ))}
        </div>

        {report ? (
          report.insufficientData ? (
            <p className="body-2">{report.loggedDays} de 7 dias registrados.</p>
          ) : hide ? (
            <p className="body-2">
              {report.loggedDays} de 7 dias registrados · proteína em 90% ou mais da meta em {report.daysProteinHit} deles
            </p>
          ) : (
            <p className="body-2">
              Média de {fmtInt(report.avg!.kcal)} kcal por dia · {balanceText(report.balanceVsTargetKcal!, 'da meta')}
            </p>
          )
        ) : (
          <div className="skeleton" style={{ height: 22 }} />
        )}

        <button type="button" className="btn btn-glass btn-block" onClick={() => setOpen(true)}>
          Ver relatório
        </button>
      </section>

      {open && <WeeklyReportSheet weekStart={weekStart} onClose={() => setOpen(false)} />}
    </>
  );
}

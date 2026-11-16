'use client';

import { useProfile, useWaterDay } from '@/lib/hooks';
import { fmtMl, STATUS_LABEL, waterStatus } from '@/lib/water';
import { useQuickSheets } from './QuickSheets';

const DROP = 'M50 6C50 6 14 48 14 82a36 36 0 0 0 72 0C86 48 50 6 50 6Z';

/** Linha compacta da Hoje: gota pequena, "Água 1.200/2.600 ml" e o status. Toque abre a folha. Some com o contador desligado. */
export function WaterLine({ date, isToday }: { date: string; isToday: boolean }) {
  const { data: profile } = useProfile();
  const enabled = profile?.waterEnabled ?? false;
  const { data: day } = useWaterDay(date, enabled);
  const { openWater } = useQuickSheets();
  if (!enabled || !day) return null;

  const now = new Date();
  const status = isToday ? waterStatus({ totalMl: day.totalMl, goalMl: day.goalMl, hour: now.getHours(), minute: now.getMinutes() }) : 'plain';
  const ratio = day.goalMl ? Math.min(1, day.totalMl / day.goalMl) : 0;

  return (
    <section aria-label="Água">
      <button type="button" className="water-line glass" onClick={() => openWater(date)}>
        <svg className="water-line-drop" width="26" height="34" viewBox="0 0 100 130" aria-hidden>
          <defs>
            <clipPath id="wl-clip">
              <path d={DROP} />
            </clipPath>
          </defs>
          <path d={DROP} className="water-drop-bg" />
          <g clipPath="url(#wl-clip)">
            <rect className="water-drop-fill" x="0" width="100" height="130" style={{ transform: `translateY(${126 - ratio * 120}px)` }} fill="var(--water)" />
          </g>
          <path d={DROP} className="water-drop-edge" />
        </svg>
        <span className="list-row-main">
          <span className="list-row-title" style={{ display: 'block' }}>
            Água <span className="num">{day.goalMl ? `${fmtMl(day.totalMl)}/${fmtMl(day.goalMl)} ml` : `${fmtMl(day.totalMl)} ml`}</span>
          </span>
          {status !== 'plain' && <span className={`list-row-sub water-status water-status-${status}`}>{STATUS_LABEL[status]}</span>}
        </span>
      </button>
    </section>
  );
}

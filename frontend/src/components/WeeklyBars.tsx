import { fromISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import type { WeeklyDay } from '@/lib/types';
import { ChartTable } from './ChartTable';

const W = 320;
const H = 140;
const PAD = { top: 10, bottom: 24, left: 4, right: 4 };

const weekdayLetter = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'narrow' }).format(fromISO(iso)).toUpperCase();

/** Barras dos 7 dias com a linha da meta. Sem vermelho: dias acima da meta usam a mesma cor. */
export function WeeklyBars({ days }: { days: WeeklyDay[] }) {
  const goal = days[0]?.goalKcal ?? 0;
  const max = Math.max(goal * 1.25, ...days.map((d) => d.kcal), 1);
  const plotH = H - PAD.top - PAD.bottom;
  const slot = (W - PAD.left - PAD.right) / days.length;
  const barW = Math.min(28, slot * 0.6);
  const y = (kcal: number) => PAD.top + plotH * (1 - kcal / max);

  const label = `Calorias por dia na semana. Meta de ${fmtInt(goal)} kcal. ${days
    .map((d) => `${weekdayLetter(d.date)}: ${d.logged ? `${fmtInt(d.kcal)} kcal` : 'sem registro'}`)
    .join('; ')}.`;

  return (
    <>
    <svg className="weekly-bars" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(goal)} y2={y(goal)} className="weekly-goal" />
      {days.map((d, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        return (
          <g key={d.date}>
            {d.logged ? (
              <rect x={x} y={y(d.kcal)} width={barW} height={Math.max(2, H - PAD.bottom - y(d.kcal))} rx={6} className="weekly-bar" />
            ) : (
              <rect x={x} y={H - PAD.bottom - 4} width={barW} height={4} rx={2} className="weekly-bar-empty" />
            )}
            <text x={x + barW / 2} y={H - 7} textAnchor="middle" className="weekly-label">
              {weekdayLetter(d.date)}
            </text>
          </g>
        );
      })}
    </svg>
    <ChartTable
      caption="Calorias por dia na semana"
      headers={['Dia', 'Calorias (kcal)']}
      rows={days.map((d) => [new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(fromISO(d.date)), d.logged ? fmtInt(d.kcal) : 'sem registro'])}
    />
    </>
  );
}

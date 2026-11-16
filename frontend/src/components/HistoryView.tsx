'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { addDays, dayMonth, dayTitle, shortDay, todayISO } from '@/lib/date';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtInt } from '@/lib/format';
import { periodLabel } from '@/lib/reports';
import type { RangeSummary, WeeklyListItem } from '@/lib/types';
import { WeeklyReportSheet } from './WeeklyReportSheet';
import { ChevronRight } from './Icons';
import { Kcal } from './Kcal';
import { MacroDots } from './MacroLegend';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
] as const;

export function HistoryView() {
  const [period, setPeriod] = useState<7 | 30>(7);
  const [reportWeek, setReportWeek] = useState<string | null>(null);
  const { hideCalories: hide } = useDisplayPrefs();
  // Sem calorias, o gráfico e o "dias na meta" passam a usar a proteína
  const metric = hide ? 'protein' : 'kcal';
  const { data: weeks } = useSWR<WeeklyListItem[]>('/reports/weekly/list?limit=12', { revalidateOnFocus: false });
  const today = todayISO();
  const from = addDays(today, -(period - 1));
  const { data, error, isLoading } = useSWR<RangeSummary>(`/days?from=${from}&to=${today}`);
  const { data: workoutData } = useSWR<{ workouts: { date: string }[] }>(`/workouts?from=${from}&to=${today}`, { revalidateOnFocus: false });
  const trainedDays = new Set(workoutData?.workouts.map((w) => w.date));

  const byDate = new Map(data?.days.map((d) => [d.date, d]) ?? []);
  const series = Array.from({ length: period }, (_, i) => {
    const date = addDays(from, i);
    return { date, kcal: byDate.get(date)?.totals[metric] ?? 0 };
  });

  const target = data?.targets?.[metric] ?? 0;
  const max = Math.max(target * 1.25, ...series.map((s) => s.kcal), 1);
  const logged = data?.days ?? [];
  const avg = (key: 'kcal' | 'protein') =>
    logged.length ? logged.reduce((s, d) => s + d.totals[key], 0) / logged.length : 0;
  const onTarget = target
    ? logged.filter((d) =>
        hide ? d.totals.protein >= target * 0.9 : Math.abs(d.totals.kcal - target) <= target * 0.1,
      ).length
    : 0;
  const text = (d: string) => (period === 7 ? shortDay(d) : dayMonth(d).split(' ')[0]);
  /** 7 dias: todos. 30 dias: a cada 5 (celular e tablet) ou a cada 3 (desktop), sempre com o dia de hoje. */
  const barLabel = (d: string, i: number) => {
    if (period === 7 || d === today) return text(d);
    const mobile = i % 5 === 0;
    const desktop = i % 3 === 0;
    if (mobile && desktop) return text(d);
    if (mobile) return <span className="not-desktop">{text(d)}</span>;
    if (desktop) return <span className="desktop-only">{text(d)}</span>;
    return '';
  };

  return (
    <main className="screen history-screen">
      <header className="header">
        <h1 className="large-title">Histórico</h1>
      </header>

      <div className="segmented" role="group" aria-label="Período">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" aria-pressed={period === p.days} onClick={() => setPeriod(p.days)}>
            {p.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}

      <section className="card glass stack-lg" aria-label={hide ? 'Proteína por dia' : 'Calorias por dia'}>
        <div className="spread">
          <h2 className="headline">{hide ? 'Proteína por dia' : 'Calorias por dia'}</h2>
          {target > 0 && <span className="caption num">Meta {fmtInt(target)} {hide ? 'g' : 'kcal'}</span>}
        </div>

        <div
          className="bars"
          style={{ gridTemplateColumns: `repeat(${period}, 1fr)`, gap: period === 7 ? 10 : 3 }}
          role="img"
          aria-label={series.map((s) => `${dayMonth(s.date)}: ${fmtInt(s.kcal)} ${hide ? 'g de proteína' : 'kcal'}`).join(', ')}
        >
          {target > 0 && (
            <span className="bars-target" style={{ bottom: `calc(24px + (100% - 24px) * ${target / max})` }} />
          )}
          {series.map((s, i) => {
            const h = (s.kcal / max) * 100;
            const cls = s.kcal === 0 ? 'bar-fill empty' : !hide && target && s.kcal > target * 1.1 ? 'bar-fill over' : 'bar-fill';
            return (
              <div key={s.date} className="bar">
                <span className="bar-fill-wrap" style={{ height: 'calc(100% - 24px)', width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                  <span className={cls} style={{ height: isLoading ? '4px' : `${Math.max(h, 2.5)}%` }} />
                </span>
                <span className={s.date === today ? 'bar-label today' : 'bar-label'} style={{ height: 18 }}>
                  {barLabel(s.date, i)}
                </span>
              </div>
            );
          })}
        </div>

        <div className="not-desktop">
          <HistoryStats hide={hide} avgKcal={avg('kcal')} avgProtein={avg('protein')} onTarget={onTarget} period={period} />
        </div>
      </section>

      {/* Desktop: estatísticas empilhadas | lista de dias. No celular, display: contents */}
      <div className="history-columns">
        <div className="history-summary desktop-only">
          <h2 className="section-title">Resumo</h2>
          <section className="card glass">
            <HistoryStats hide={hide} avgKcal={avg('kcal')} avgProtein={avg('protein')} onTarget={onTarget} period={period} stacked />
          </section>
        </div>

        <div className="history-days">
          <h2 className="section-title">Dias registrados</h2>
          <section className="card glass">
            {logged.length === 0 ? (
              <p className="body-2">
                {isLoading ? 'Carregando…' : 'Nada registrado neste período.'}
              </p>
            ) : (
              <div className="list">
                {[...logged].reverse().map((d) => (
                  <Link key={d.date} href={d.date === today ? '/' : `/?date=${d.date}`} className="list-row">
                    <span className="list-row-main">
                      <span className="list-row-title" style={{ display: 'block' }}>
                        {dayTitle(d.date)}
                        {trainedDays.has(d.date) && (
                          <span className="workout-dot workout-dot-inline" role="img" aria-label="Com treino" />
                        )}
                      </span>
                      <span className="list-row-sub">
                        <MacroDots m={d.totals} />
                      </span>
                    </span>
                    <span className="list-row-end">
                      {hide ? `${fmtInt(d.totals.protein)} g de proteína` : <Kcal value={d.totals.kcal} />}
                    </span>
                    <ChevronRight width={16} height={16} style={{ color: 'var(--text-3)' }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <section className="history-weeks" aria-labelledby="weekly-reports-title">
        <h2 className="section-title" id="weekly-reports-title">
          Relatórios semanais
        </h2>
        <div className="card glass">
          {!weeks ? (
            <div className="skeleton" style={{ height: 52 }} />
          ) : weeks.length === 0 ? (
            <p className="body-2">Os relatórios aparecem quando há alguns dias registrados.</p>
          ) : (
            <div className="list">
              {weeks.map((w) => (
                <button key={w.weekStart} type="button" className="list-row" onClick={() => setReportWeek(w.weekStart)}>
                  <span className="list-row-main">
                    <span className="list-row-title" style={{ display: 'block' }}>
                      {periodLabel(w.weekStart, w.weekEnd)}
                    </span>
                    <span className="list-row-sub">{w.loggedDays} de 7 dias registrados</span>
                  </span>
                  <ChevronRight width={16} height={16} style={{ color: 'var(--text-3)' }} />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {reportWeek && <WeeklyReportSheet weekStart={reportWeek} onClose={() => setReportWeek(null)} />}
    </main>
  );
}

interface HistoryStatsProps {
  hide: boolean;
  avgKcal: number;
  avgProtein: number;
  onTarget: number;
  period: number;
  /** Desktop: uma estatística por linha, num card próprio. */
  stacked?: boolean;
}

function HistoryStats({ hide, avgKcal, avgProtein, onTarget, period, stacked }: HistoryStatsProps) {
  return (
    <div className={stacked ? 'stats-stacked' : 'grid-2'} style={stacked ? undefined : { gridTemplateColumns: hide ? '1fr 1fr' : '1fr 1fr 1fr' }}>
      {!hide && (
        <div className="stat">
          <span className="caption">Média</span>
          <strong>{fmtInt(avgKcal)}</strong>
          <span className="caption">kcal por dia</span>
        </div>
      )}
      <div className="stat">
        <span className="caption" style={{ color: 'var(--ring-protein)' }}>
          Proteína
        </span>
        <strong>{fmtInt(avgProtein)} g</strong>
        <span className="caption">média diária</span>
      </div>
      <div className="stat">
        <span className="caption">Na meta</span>
        <strong>
          {onTarget}/{period}
        </strong>
        <span className="caption">{hide ? 'dias com proteína em 90% ou mais da meta' : 'dias (±10%)'}</span>
      </div>
    </div>
  );
}

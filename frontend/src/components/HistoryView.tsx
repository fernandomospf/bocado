'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { addDays, dayMonth, dayTitle, shortDay, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import type { RangeSummary } from '@/lib/types';
import { ChevronRight } from './Icons';
import { MacroDots } from './MacroLegend';

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
] as const;

export function HistoryView() {
  const [period, setPeriod] = useState<7 | 30>(7);
  const today = todayISO();
  const from = addDays(today, -(period - 1));
  const { data, error, isLoading } = useSWR<RangeSummary>(`/days?from=${from}&to=${today}`);

  const byDate = new Map(data?.days.map((d) => [d.date, d]) ?? []);
  const series = Array.from({ length: period }, (_, i) => {
    const date = addDays(from, i);
    return { date, kcal: byDate.get(date)?.totals.kcal ?? 0 };
  });

  const target = data?.targets?.kcal ?? 0;
  const max = Math.max(target * 1.25, ...series.map((s) => s.kcal), 1);
  const logged = data?.days ?? [];
  const avg = (key: 'kcal' | 'protein') =>
    logged.length ? logged.reduce((s, d) => s + d.totals[key], 0) / logged.length : 0;
  const onTarget = target
    ? logged.filter((d) => Math.abs(d.totals.kcal - target) <= target * 0.1).length
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

      <section className="card glass stack-lg" aria-label="Calorias por dia">
        <div className="spread">
          <h2 className="headline">Calorias por dia</h2>
          {target > 0 && <span className="caption num">Meta {fmtInt(target)} kcal</span>}
        </div>

        <div
          className="bars"
          style={{ gridTemplateColumns: `repeat(${period}, 1fr)`, gap: period === 7 ? 10 : 3 }}
          role="img"
          aria-label={series.map((s) => `${dayMonth(s.date)}: ${fmtInt(s.kcal)} kcal`).join(', ')}
        >
          {target > 0 && (
            <span className="bars-target" style={{ bottom: `calc(24px + (100% - 24px) * ${target / max})` }} />
          )}
          {series.map((s, i) => {
            const h = (s.kcal / max) * 100;
            const cls = s.kcal === 0 ? 'bar-fill empty' : target && s.kcal > target * 1.1 ? 'bar-fill over' : 'bar-fill';
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
          <HistoryStats avgKcal={avg('kcal')} avgProtein={avg('protein')} onTarget={onTarget} period={period} />
        </div>
      </section>

      {/* Desktop: estatísticas empilhadas | lista de dias. No celular, display: contents */}
      <div className="history-columns">
        <div className="history-summary desktop-only">
          <h2 className="section-title">Resumo</h2>
          <section className="card glass">
            <HistoryStats avgKcal={avg('kcal')} avgProtein={avg('protein')} onTarget={onTarget} period={period} stacked />
          </section>
        </div>

        <div className="history-days">
          <h2 className="section-title">Dias registrados</h2>
          <section className="card glass">
            {logged.length === 0 ? (
              <p className="body-2">
                {isLoading ? 'Carregando…' : 'Nenhuma refeição neste período. Registre a próxima pelo botão +.'}
              </p>
            ) : (
              <div className="list">
                {[...logged].reverse().map((d) => (
                  <Link key={d.date} href={d.date === today ? '/' : `/?date=${d.date}`} className="list-row">
                    <span className="list-row-main">
                      <span className="list-row-title" style={{ display: 'block' }}>
                        {dayTitle(d.date)}
                      </span>
                      <span className="list-row-sub">
                        <MacroDots m={d.totals} />
                      </span>
                    </span>
                    <span className="list-row-end">{fmtInt(d.totals.kcal)} kcal</span>
                    <ChevronRight width={16} height={16} style={{ color: 'var(--text-3)' }} />
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

interface HistoryStatsProps {
  avgKcal: number;
  avgProtein: number;
  onTarget: number;
  period: number;
  /** Desktop: uma estatística por linha, num card próprio. */
  stacked?: boolean;
}

function HistoryStats({ avgKcal, avgProtein, onTarget, period, stacked }: HistoryStatsProps) {
  return (
    <div className={stacked ? 'stats-stacked' : 'grid-2'} style={stacked ? undefined : { gridTemplateColumns: '1fr 1fr 1fr' }}>
      <div className="stat">
        <span className="caption">Média</span>
        <strong>{fmtInt(avgKcal)}</strong>
        <span className="caption">kcal por dia</span>
      </div>
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
        <span className="caption">dias (±10%)</span>
      </div>
    </div>
  );
}

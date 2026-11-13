'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { addDays, dayMonth, todayISO } from '@/lib/date';
import { fmtDec } from '@/lib/format';
import type { Profile, WeightEntry, WeightList, WeightSummary } from '@/lib/types';
import { ChevronRight, PlusIcon } from './Icons';
import { WeightChart } from './WeightChart';
import { WeightSheet } from './WeightSheet';

type Period = 30 | 90;

const PERIODS: { value: Period; label: string }[] = [
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
];

const RECENT_COUNT = 5;

/** Variação com sinal tipográfico: "−0,8 kg", "+1,2 kg". Sem julgamento de cor: o "bom" depende do objetivo. */
export function fmtChange(n: number) {
  if (Math.abs(n) < 0.05) return 'estável';
  return `${n > 0 ? '+' : '−'}${fmtDec(Math.abs(n))} kg`;
}

/** Revalida tudo que depende do peso: lista, resumo e o perfil (cujo peso acompanha o registro mais recente). */
export const isWeightKey = (key: unknown) =>
  typeof key === 'string' && (key.startsWith('/weight') || key === '/profile');

export function WeightSection() {
  const { mutate: globalMutate } = useSWRConfig();
  const today = todayISO();
  const yearAgo = addDays(today, -365);

  const { data: summary } = useSWR<WeightSummary>('/weight/summary');
  const { data: list } = useSWR<WeightList>(`/weight?from=${yearAgo}&to=${today}`);

  const [period, setPeriod] = useState<Period>(30);
  const [sheet, setSheet] = useState<{ entry?: WeightEntry } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recalc, setRecalc] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const entries = useMemo(() => list?.entries ?? [], [list]);
  const periodStart = addDays(today, -(period - 1));
  const inPeriod = useMemo(() => entries.filter((e) => e.date >= periodStart), [entries, periodStart]);
  const recent = useMemo(() => [...entries].reverse(), [entries]);

  const chartLabel = useMemo(() => {
    if (inPeriod.length === 0) return `Peso nos últimos ${period} dias: sem registros.`;
    const first = inPeriod[0];
    const last = inPeriod[inPeriod.length - 1];
    if (inPeriod.length === 1) return `Peso nos últimos ${period} dias: um registro, ${fmtDec(last.weightKg)} kg.`;
    return (
      `Peso nos últimos ${period} dias, ${inPeriod.length} registros: tendência de ${fmtDec(first.trendKg)} kg ` +
      `para ${fmtDec(last.trendKg)} kg (${fmtChange(last.trendKg - first.trendKg)}).`
    );
  }, [inPeriod, period]);

  async function refresh() {
    await globalMutate(isWeightKey);
    setSheet(null);
  }

  async function recalculateTargets() {
    setRecalc({ busy: true, error: null });
    try {
      const updated = await api<Profile>('/profile/targets/reset', { method: 'POST' });
      await globalMutate('/profile', updated, { revalidate: false });
      await globalMutate('/weight/summary');
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/days'));
      setRecalc({ busy: false, error: null });
    } catch (err) {
      setRecalc({ busy: false, error: errorMessage(err) });
    }
  }

  if (!summary) return null;

  const latest = summary.latest;
  const change = summary.change30Kg ?? summary.change7Kg;
  const changeDays = summary.change30Kg !== null ? 30 : 7;

  return (
    <>
      <h2 className="section-title">Peso</h2>
      <section className="card glass stack-lg">
        {latest ? (
          <>
            <div className="spread" style={{ alignItems: 'flex-end' }}>
              <div className="stack" style={{ gap: 4 }}>
                <p className="large-title num">
                  {fmtDec(latest.weightKg)} <span className="headline">kg</span>
                </p>
                <p className="body-2 num">
                  {summary.trendKg !== null && <>Tendência {fmtDec(summary.trendKg)} kg</>}
                  {change !== null && (
                    <>
                      {' · '}
                      {fmtChange(change)} em {changeDays} dias
                    </>
                  )}
                </p>
              </div>
              <span className="caption">{latest.date === today ? 'Hoje' : dayMonth(latest.date)}</span>
            </div>

            <div className="segmented" role="group" aria-label="Período do gráfico">
              {PERIODS.map((p) => (
                <button key={p.value} type="button" aria-pressed={period === p.value} onClick={() => setPeriod(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>

            {inPeriod.length > 0 ? (
              <figure className="weight-chart-wrap">
                <WeightChart entries={inPeriod} from={periodStart} to={today} label={chartLabel} />
                <figcaption className="caption weight-chart-legend">
                  <span>
                    <i className="weight-legend-point" /> Pesagens
                  </span>
                  <span>
                    <i className="weight-legend-trend" /> Média de 7 dias
                  </span>
                </figcaption>
              </figure>
            ) : (
              <p className="caption" style={{ textAlign: 'center' }}>
                Nenhum registro nos últimos {period} dias.
              </p>
            )}

            {summary.targetsOutdated && (
              <div className="stack" style={{ gap: 8 }}>
                <p className="note">Seu peso mudou mais de 2 kg desde que as metas foram calculadas.</p>
                {recalc.error && (
                  <p className="alert" role="alert">
                    {recalc.error}
                  </p>
                )}
                <button className="btn btn-glass btn-block" onClick={recalculateTargets} disabled={recalc.busy}>
                  {recalc.busy ? <span className="spinner" aria-label="Recalculando" /> : 'Recalcular metas'}
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="body-2" style={{ textAlign: 'center' }}>
            Registre seu peso para acompanhar a tendência.
          </p>
        )}

        <button className="btn btn-primary btn-block" onClick={() => setSheet({})}>
          <PlusIcon width={20} height={20} />
          Registrar peso
        </button>

        {recent.length > 0 && (
          <div className="list" aria-label="Últimos registros">
            {(showAll ? recent : recent.slice(0, RECENT_COUNT)).map((e) => (
              <button key={e.date} type="button" className="list-row" onClick={() => setSheet({ entry: e })}>
                <div className="list-row-main">
                  <div className="list-row-title">{e.date === today ? 'Hoje' : dayMonth(e.date)}</div>
                  {e.note && <div className="list-row-sub">{e.note}</div>}
                </div>
                <span className="list-row-end num">{fmtDec(e.weightKg)} kg</span>
                <ChevronRight width={16} height={16} aria-hidden />
              </button>
            ))}
            {recent.length > RECENT_COUNT && (
              <button type="button" className="btn btn-plain" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Mostrar menos' : `Mostrar todos (${recent.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      {sheet && (
        <WeightSheet
          key={sheet.entry?.date ?? 'new'}
          entry={sheet.entry}
          defaultWeight={latest?.weightKg}
          onClose={() => setSheet(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}

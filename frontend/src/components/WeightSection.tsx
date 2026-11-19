'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { addDays, dayMonth, todayISO } from '@/lib/date';
import { fmtDec } from '@/lib/format';
import type { Profile, WeightEntry, WeightImportRecord, WeightList, WeightSummary } from '@/lib/types';
import { ChevronRight, PlusIcon } from './Icons';
import { useSupplementNames, useSupplementsEnabled, useWeightMarkers } from '@/lib/useSupplements';
import { ChartTable } from './ChartTable';
import { WeightChart } from './WeightChart';
import { WeightGoalCard } from './WeightGoalCard';
import { WeightImportSheet } from './WeightImportSheet';
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

  const { data: imports } = useSWR<WeightImportRecord[]>('/weight/imports', { revalidateOnFocus: false });
  const [importing, setImporting] = useState(false);
  const [period, setPeriod] = useState<Period>(30);
  const [markerDay, setMarkerDay] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ entry?: WeightEntry } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [recalc, setRecalc] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const entries = useMemo(() => list?.entries ?? [], [list]);
  const goalKg = list?.goalWeightKg ?? null;
  const periodStart = addDays(today, -(period - 1));
  const inPeriod = useMemo(() => entries.filter((e) => e.date >= periodStart), [entries, periodStart]);
  const recent = useMemo(() => [...entries].reverse(), [entries]);

  // Doses registradas (só dos itens com "Mostrar marcador no gráfico de peso"); nomes genéricos se a pessoa os ocultou
  const supplementsOn = useSupplementsEnabled();
  const { data: markerRows } = useWeightMarkers(periodStart, today, supplementsOn);
  const { name: markerName } = useSupplementNames();
  const markers = useMemo(() => {
    const byDay = new Map<string, Set<string>>();
    for (const m of markerRows ?? []) {
      const set = byDay.get(m.date) ?? new Set<string>();
      set.add(markerName({ id: m.planId, name: m.label }));
      byDay.set(m.date, set);
    }
    return [...byDay].map(([date, labels]) => ({ date, labels: [...labels] }));
  }, [markerRows, markerName]);
  const markedDay = markers.find((m) => m.date === markerDay);

  const chartLabel = useMemo(() => {
    if (inPeriod.length === 0) return `Peso nos últimos ${period} dias: sem registros.`;
    const first = inPeriod[0];
    const last = inPeriod[inPeriod.length - 1];
    if (inPeriod.length === 1) return `Peso nos últimos ${period} dias: um registro, ${fmtDec(last.weightKg)} kg.`;
    return (
      `Peso nos últimos ${period} dias, ${inPeriod.length} registros: tendência de ${fmtDec(first.trendKg)} kg ` +
      `para ${fmtDec(last.trendKg)} kg (${fmtChange(last.trendKg - first.trendKg)}).` +
      (goalKg != null ? ` Meta de ${fmtDec(goalKg)} kg.` : '')
    );
  }, [inPeriod, period, goalKg]);

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
      <h2 className="section-title" id="peso">
        Peso
      </h2>
      <WeightGoalCard summary={summary} />
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
                <WeightChart
                  entries={inPeriod}
                  from={periodStart}
                  to={today}
                  label={chartLabel + (markers.length > 0 ? ` Doses registradas em ${markers.length} ${markers.length === 1 ? 'dia' : 'dias'}.` : '')}
                  goalKg={goalKg}
                  markers={markers}
                  selectedMarker={markerDay}
                  onSelectMarker={setMarkerDay}
                />
                <figcaption className="caption weight-chart-legend">
                  <span>
                    <i className="weight-legend-point" /> Pesagens
                  </span>
                  <span>
                    <i className="weight-legend-trend" /> Média de 7 dias
                  </span>
                  {goalKg != null && <span>- - Meta</span>}
                  {markers.length > 0 && (
                    <span>
                      <i className="weight-legend-marker" /> Doses
                    </span>
                  )}
                </figcaption>
                {markedDay && (
                  <p className="caption weight-marker-note" role="status">
                    {dayMonth(markedDay.date)} · {markedDay.labels.join(', ')}
                  </p>
                )}
                <ChartTable
                  caption={`Peso nos últimos ${period} dias`}
                  headers={['Data', 'Peso (kg)', 'Média de 7 dias (kg)']}
                  rows={[...inPeriod].reverse().map((e) => [dayMonth(e.date), fmtDec(e.weightKg), fmtDec(e.trendKg)])}
                />
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

        <button type="button" className="btn btn-glass btn-block" onClick={() => setImporting(true)}>
          Importar histórico
        </button>

        {imports && imports.length > 0 && <ImportsList imports={imports} onUndone={refresh} />}

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

      {importing && <WeightImportSheet onClose={() => setImporting(false)} onChanged={async () => {
          await globalMutate((key) => isWeightKey(key) || key === '/weight/imports');
        }} />}

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

const SOURCE_LABEL: Record<WeightImportRecord['source'], string> = { CSV: 'CSV', APPLE_HEALTH: 'App Saúde' };

/** Importações feitas, cada uma com "Desfazer" (apaga só os registros que ela criou). */
function ImportsList({ imports, onUndone }: { imports: WeightImportRecord[]; onUndone: () => void | Promise<void> }) {
  const { mutate } = useSWRConfig();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function undo(id: string) {
    setError(null);
    try {
      await api(`/weight/import/${id}`, { method: 'DELETE' });
      setConfirm(null);
      await mutate('/weight/imports');
      await onUndone();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="stack-sm" aria-label="Importações">
      <h3 className="caption">Importações</h3>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <ul className="list">
        {imports.map((i) => (
          <li key={i.id} className="list-row">
            <span className="list-row-main">
              <span className="list-row-title">
                {SOURCE_LABEL[i.source]} · {i.count} {i.count === 1 ? 'registro' : 'registros'}
              </span>
              <span className="list-row-sub">{new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(i.createdAt))}</span>
            </span>
            {confirm === i.id ? (
              <span className="row" style={{ gap: 6 }}>
                <button type="button" className="btn btn-glass btn-sm" onClick={() => void undo(i.id)}>
                  Apagar {i.count}
                </button>
                <button type="button" className="btn btn-plain btn-sm" onClick={() => setConfirm(null)}>
                  Manter
                </button>
              </span>
            ) : (
              <button type="button" className="btn btn-plain btn-sm" onClick={() => setConfirm(i.id)}>
                Desfazer
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

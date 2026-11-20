'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import useSWR from 'swr';
import { addDays, dayMonth, isValidISO, todayISO } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { ReportSharesList, ShareCreator } from './ReportShare';
import { Sheet } from './Sheet';

export interface NutritionistData {
  name: string;
  from: string;
  to: string;
  hideCalories: boolean;
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  days: { date: string; registered: boolean; kcal: number; protein: number; carbs: number; fat: number }[];
  loggedDays: number;
  totalDays: number;
  averages: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
  weight: { start: { date: string; trendKg: number }; end: { date: string; trendKg: number }; entries: number } | null;
  water: { loggedDays: number; avgMl: number } | null;
  workouts: { count: number; totalMinutes: number } | null;
}

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 15, label: '15 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '3 meses' },
] as const;

const br = (iso: string) => iso.split('-').reverse().join('/');

/** Perfil: escolhe o período e abre /relatorio (a página imprimível). */
export function NutritionistReportSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<number>(30);
  const to = todayISO();
  const from = addDays(to, -(days - 1));
  return (
    <Sheet open title="Relatório para o nutricionista" onClose={onClose}>
      <div className="stack-lg">
        <div>
          <h2 className="title">Relatório para o nutricionista</h2>
          <p className="caption">Uma página para imprimir ou salvar em PDF, com o que você registrou no período.</p>
        </div>
        <div className="segmented segmented-2col" role="group" aria-label="Período">
          {PERIODS.map((p) => (
            <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
        <p className="caption num">
          {br(from)} a {br(to)}
        </p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => router.push(`/relatorio?from=${from}&to=${to}`)}>
          Gerar relatório
        </button>
        <hr className="share-sep" />
        <ShareCreator key={`${from}${to}`} from={from} to={to} />
        <ReportSharesList />
      </div>
    </Sheet>
  );
}

/** Página /relatorio: layout de papel (A4). Na impressão só ela aparece (ver @media print em globals.css). */
export function NutritionistReportView() {
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get('to');
  const from = params.get('from');
  const ok = isValidISO(from) && isValidISO(to);
  const { data, error } = useSWR<NutritionistData>(ok ? `/reports/nutritionist?from=${from}&to=${to}` : null, { revalidateOnFocus: false });
  const generated = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date());

  if (!ok) {
    return (
      <main className="screen screen-narrow">
        <p className="alert" role="alert">
          Período inválido. Gere o relatório pelo Perfil.
        </p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="screen screen-narrow">
        <p className="alert" role="alert">
          {error.message}
        </p>
      </main>
    );
  }
  if (!data) return <div className="splash" aria-busy="true"><span className="spinner" aria-label="Carregando" /></div>;

  return (
    <main className="screen report-screen">
      <div className="report-actions no-print">
        <button type="button" className="btn btn-glass" onClick={() => router.back()}>
          Voltar
        </button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          Salvar como PDF
        </button>
      </div>

      <ReportDocument data={data} generated={generated} />
    </main>
  );
}

/** O documento do relatório (a folha): usado na página do Perfil e no link público. */
export function ReportDocument({ data, generated }: { data: NutritionistData; generated: string }) {
  const hide = data.hideCalories;
  const { targets: t, averages: a } = data;
  return (
    <article className="report-page">
        <header className="report-head">
          <h1 className="report-title">Relatório de alimentação</h1>
          <p>
            <strong>{data.name}</strong>
          </p>
          <p className="num">
            Período: {br(data.from)} a {br(data.to)} · Gerado em {generated}
          </p>
        </header>

        <section aria-labelledby="rep-resumo">
          <h2 id="rep-resumo">Resumo</h2>
          <p className="num">
            Dias registrados: {data.loggedDays} de {data.totalDays}. As médias consideram só os dias registrados.
          </p>
          <table className="report-table">
            <thead>
              <tr>
                <th scope="col">Média por dia</th>
                <th scope="col">Registrado</th>
                <th scope="col">Meta atual</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ...(hide ? [] : [['Energia (kcal)', a.kcal, t.kcal]]),
                  ['Proteína (g)', a.protein, t.protein],
                  ['Carboidratos (g)', a.carbs, t.carbs],
                  ['Gorduras (g)', a.fat, t.fat],
                ] as [string, number | null, number][]
              ).map(([label, v, goal]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="num">{v === null ? '—' : label.startsWith('Energia') ? fmtInt(v) : fmtDec(v)}</td>
                  <td className="num">{fmtInt(goal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {(data.weight || data.water || data.workouts) && (
          <section aria-labelledby="rep-outros">
            <h2 id="rep-outros">Outros registros</h2>
            <ul>
              {data.weight && (
                <li className="num">
                  Peso (tendência de 7 dias): {fmtDec(data.weight.start.trendKg)} kg em {br(data.weight.start.date)} → {fmtDec(data.weight.end.trendKg)} kg em {br(data.weight.end.date)} ({data.weight.entries}{' '}
                  {data.weight.entries === 1 ? 'pesagem' : 'pesagens'})
                </li>
              )}
              {data.water && (
                <li className="num">
                  Água: média de {fmtInt(data.water.avgMl)} ml por dia, em {data.water.loggedDays} {data.water.loggedDays === 1 ? 'dia registrado' : 'dias registrados'}
                </li>
              )}
              {data.workouts && (
                <li className="num">
                  Treinos: {data.workouts.count} {data.workouts.count === 1 ? 'treino' : 'treinos'}, {fmtInt(data.workouts.totalMinutes)} min no total
                </li>
              )}
            </ul>
          </section>
        )}

        <section aria-labelledby="rep-dias">
          <h2 id="rep-dias">Dia a dia</h2>
          <table className="report-table report-days">
            <thead>
              <tr>
                <th scope="col">Dia</th>
                {!hide && <th scope="col">kcal</th>}
                <th scope="col">Proteína (g)</th>
                <th scope="col">Carboidratos (g)</th>
                <th scope="col">Gorduras (g)</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((d) => (
                <tr key={d.date}>
                  <th scope="row">{dayMonth(d.date)}</th>
                  {d.registered ? (
                    <>
                      {!hide && <td className="num">{fmtInt(d.kcal)}</td>}
                      <td className="num">{fmtDec(d.protein)}</td>
                      <td className="num">{fmtDec(d.carbs)}</td>
                      <td className="num">{fmtDec(d.fat)}</td>
                    </>
                  ) : (
                    <td colSpan={hide ? 3 : 4} className="report-empty">
                      sem registro
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <footer className="report-foot">Dados registrados pela própria pessoa no Bocado; as estimativas por foto e descrição são aproximadas.</footer>
    </article>
  );
}

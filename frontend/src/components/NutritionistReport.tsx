'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import useSWR from 'swr';
import { addDays, dayMonth, isValidISO, todayISO } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { reportFilename, savePdf } from '@/lib/savePdf';
import { ReportSharesList, ShareCreator } from './ReportShare';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

export interface NutritionistData {
  name: string;
  from: string;
  to: string;
  hideCalories: boolean;
  foods?: boolean;
  targets: { kcal: number; protein: number; carbs: number; fat: number };
  days: { date: string; registered: boolean; kcal: number; protein: number; carbs: number; fat: number; meals?: { type: string; items: { name: string; grams: number }[] }[] }[];
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
const brShort = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/');
const MEAL_LABEL: Record<string, string> = { BREAKFAST: 'Café da manhã', LUNCH: 'Almoço', SNACK: 'Lanche', DINNER: 'Jantar' };

/** Perfil: escolhe o período e as opções e abre /relatorio; também cria o link compartilhável. */
export function NutritionistReportSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [days, setDays] = useState<number>(30);
  const [foods, setFoods] = useState(false);
  const [name, setName] = useState(true);
  const to = todayISO();
  const from = addDays(to, -(days - 1));
  const query = `from=${from}&to=${to}${foods ? '&foods=1' : ''}${name ? '' : '&name=0'}`;
  return (
    <Sheet open title="Relatório para o nutricionista" onClose={onClose}>
      <div className="stack-lg">
        <div>
          <h2 className="title">Relatório para o nutricionista</h2>
          <p className="caption">Um PDF (A4) com o que você registrou no período, para salvar ou enviar.</p>
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
        <fieldset className="stack-sm import-conflict">
          <legend className="field-label">O que incluir</legend>
          <label className="check-row">
            <input type="checkbox" checked={foods} onChange={(e) => setFoods(e.target.checked)} />
            <span>Os alimentos de cada refeição</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={name} onChange={(e) => setName(e.target.checked)} />
            <span>Meu nome no cabeçalho</span>
          </label>
        </fieldset>
        <button type="button" className="btn btn-primary btn-block" onClick={() => router.push(`/relatorio?${query}`)}>
          Gerar relatório
        </button>
        <hr className="share-sep" />
        <ShareCreator key={`${from}${to}`} from={from} to={to} />
        <ReportSharesList />
      </div>
    </Sheet>
  );
}

/** Rota logada /relatorio: tela de foco (sem TabBar nem Sidebar), mesmo componente da página pública. */
export function NutritionistReportView() {
  const router = useRouter();
  const params = useSearchParams();
  const to = params.get('to');
  const from = params.get('from');
  const ok = isValidISO(from) && isValidISO(to);
  const opts = `${params.get('foods') === '1' ? '&foods=1' : ''}${params.get('name') === '0' ? '&name=0' : ''}`;
  const { data, error } = useSWR<NutritionistData>(ok ? `/reports/nutritionist?from=${from}&to=${to}${opts}` : null, { revalidateOnFocus: false });

  if (!ok) {
    return (
      <main className="screen screen-narrow report-screen">
        <p className="alert" role="alert">
          Período inválido. Gere o relatório pelo Perfil.
        </p>
      </main>
    );
  }
  if (error) {
    return (
      <main className="screen screen-narrow report-screen">
        <p className="alert" role="alert">
          {error.message}
        </p>
      </main>
    );
  }
  if (!data) {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" aria-label="Carregando" />
      </div>
    );
  }
  return <ReportScreen data={data} pdfUrl={`/api/reports/nutritionist.pdf?from=${from}&to=${to}${opts}`} onBack={() => router.back()} />;
}

/** Barra superior (Voltar e Salvar como PDF) + o relatório. Usado na rota logada e na página pública /r/[token]. */
export function ReportScreen({ data, pdfUrl, onBack }: { data: NutritionistData; pdfUrl: string; onBack?: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Imprimir" só no desktop (mouse/trackpad): no celular e no app instalado o PDF é o caminho
  const [desktop, setDesktop] = useState(false);
  useEffect(() => setDesktop(window.matchMedia('(pointer: fine) and (min-width: 900px)').matches), []);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await savePdf({ url: pdfUrl, filename: reportFilename(data.from, data.to), title: 'Relatório de alimentação' });
      if (r === 'downloaded') toast.show({ message: 'PDF salvo' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Não foi possível gerar o PDF.';
      setError(msg);
      toast.show({ message: msg, tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="report-screen">
      <div className="report-bar no-print">
        {onBack ? (
          <button type="button" className="btn btn-glass" onClick={onBack}>
            Voltar
          </button>
        ) : (
          <span />
        )}
        <div className="report-bar-actions">
          {desktop && (
            <button type="button" className="btn btn-plain" onClick={() => window.print()}>
              Imprimir
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy} aria-describedby={error ? 'report-pdf-error' : undefined}>
            {busy ? <span className="spinner" aria-label="Gerando o PDF" /> : 'Salvar como PDF'}
          </button>
        </div>
      </div>
      {error && (
        <p className="alert report-alert no-print" role="alert" id="report-pdf-error">
          {error}
        </p>
      )}
      <ReportDocument data={data} generated={new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date())} />
    </main>
  );
}

const pct = (v: number | null, goal: number) => (v === null || goal <= 0 ? '—' : `${fmtInt(Math.round((v / goal) * 100))}%`);

/** O documento. Fluido na tela (largura 100%); cartões no celular e tabelas no desktop (container query); A4 só ao imprimir. */
export function ReportDocument({ data, generated }: { data: NutritionistData; generated: string }) {
  const hide = data.hideCalories;
  const { targets: t, averages: a } = data;
  const avgRows = [
    ...(hide ? [] : [{ label: 'Energia (kcal)', value: a.kcal, goal: t.kcal, kcal: true }]),
    { label: 'Proteína (g)', value: a.protein, goal: t.protein, kcal: false },
    { label: 'Carboidratos (g)', value: a.carbs, goal: t.carbs, kcal: false },
    { label: 'Gorduras (g)', value: a.fat, goal: t.fat, kcal: false },
  ];
  const shown = (v: number | null, kcal: boolean) => (v === null ? '—' : kcal ? fmtInt(v) : fmtDec(v));
  const hasOthers = !!(data.weight || data.water || data.workouts);

  return (
    <article className="report-page">
      <header className="report-head">
        <h1 className="report-title">Relatório de alimentação</h1>
        {data.name && (
          <p>
            <strong>{data.name}</strong>
          </p>
        )}
        <p className="num">
          Período: {brShort(data.from)} a {br(data.to)}
        </p>
        <p className="num">Gerado em {generated}</p>
      </header>

      <section aria-labelledby="rep-resumo">
        <h2 id="rep-resumo">Resumo</h2>
        <p className="num">
          Dias registrados: {data.loggedDays} de {data.totalDays}. As médias consideram só os dias registrados.
        </p>

        <table className="report-table report-avg-table">
          <thead>
            <tr>
              <th scope="col">Média por dia</th>
              <th scope="col">Registrado</th>
              <th scope="col">Meta</th>
              <th scope="col">% da meta</th>
            </tr>
          </thead>
          <tbody>
            {avgRows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                <td className="num">{shown(r.value, r.kcal)}</td>
                <td className="num">{fmtInt(r.goal)}</td>
                <td className="num">{pct(r.value, r.goal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="report-avg-cards" aria-label="Média por dia">
          {avgRows.map((r) => (
            <li key={r.label} className="report-card">
              <strong>{r.label}</strong>
              <dl>
                <div>
                  <dt>Registrado</dt>
                  <dd className="num">{shown(r.value, r.kcal)}</dd>
                </div>
                <div>
                  <dt>Meta</dt>
                  <dd className="num">{fmtInt(r.goal)}</dd>
                </div>
                <div>
                  <dt>% da meta</dt>
                  <dd className="num">{pct(r.value, r.goal)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {hasOthers && (
        <section aria-labelledby="rep-outros">
          <h2 id="rep-outros">Outros registros</h2>
          <ul className="report-others">
            {data.weight && (
              <li>
                <span className="report-other-label">Peso (tendência de 7 dias)</span>
                <span className="report-other-value num">
                  {fmtDec(data.weight.start.trendKg)} kg → {fmtDec(data.weight.end.trendKg)} kg
                </span>
                <span className="report-other-note num">
                  {brShort(data.weight.start.date)} a {brShort(data.weight.end.date)} · {data.weight.entries} {data.weight.entries === 1 ? 'pesagem' : 'pesagens'}
                </span>
              </li>
            )}
            {data.water && (
              <li>
                <span className="report-other-label">Água</span>
                <span className="report-other-value num">média de {fmtInt(data.water.avgMl)} ml por dia</span>
                <span className="report-other-note num">
                  {data.water.loggedDays} {data.water.loggedDays === 1 ? 'dia registrado' : 'dias registrados'}
                </span>
              </li>
            )}
            {data.workouts && (
              <li>
                <span className="report-other-label">Treinos</span>
                <span className="report-other-value num">
                  {data.workouts.count} {data.workouts.count === 1 ? 'treino' : 'treinos'}
                </span>
                <span className="report-other-note num">{fmtInt(data.workouts.totalMinutes)} min no total</span>
              </li>
            )}
          </ul>
        </section>
      )}

      <section aria-labelledby="rep-dias">
        <h2 id="rep-dias">Dia a dia</h2>

        <table className="report-table report-days-table">
          <thead>
            <tr>
              <th scope="col">Dia</th>
              {!hide && <th scope="col">kcal</th>}
              <th scope="col">P (g)</th>
              <th scope="col">C (g)</th>
              <th scope="col">G (g)</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((d) => (
              <DayRows key={d.date} d={d} hide={hide} foods={!!data.foods} />
            ))}
          </tbody>
        </table>

        <ul className="report-days-list" aria-label="Dia a dia">
          {data.days.map((d) => (
            <li key={d.date} className="report-card">
              <strong className="num">{dayMonth(d.date)}</strong>
              {d.registered ? (
                <p className="report-day-line num">
                  {!hide && <span>{fmtInt(d.kcal)} kcal</span>}
                  <span>P {fmtDec(d.protein)} g</span>
                  <span>C {fmtDec(d.carbs)} g</span>
                  <span>G {fmtDec(d.fat)} g</span>
                </p>
              ) : (
                <p className="report-empty">sem registro</p>
              )}
              {d.registered && data.foods && <FoodsDetail meals={d.meals ?? []} />}
            </li>
          ))}
        </ul>
      </section>

      <footer className="report-foot">Dados registrados pela própria pessoa no Bocado; as estimativas por foto e descrição são aproximadas.</footer>
    </article>
  );
}

function FoodsDetail({ meals }: { meals: { type: string; items: { name: string; grams: number }[] }[] }): ReactNode {
  if (meals.length === 0) return null;
  return (
    <details className="report-foods">
      <summary>Alimentos</summary>
      <ul>
        {meals.map((m) => (
          <li key={m.type}>
            <strong>{MEAL_LABEL[m.type] ?? m.type}:</strong> {m.items.map((i) => `${i.name} (${fmtDec(i.grams)} g)`).join(', ')}
          </li>
        ))}
      </ul>
    </details>
  );
}

function DayRows({ d, hide, foods }: { d: NutritionistData['days'][number]; hide: boolean; foods: boolean }) {
  const cols = hide ? 4 : 5;
  return (
    <>
      <tr>
        <th scope="row">{brShort(d.date)}</th>
        {d.registered ? (
          <>
            {!hide && <td className="num">{fmtInt(d.kcal)}</td>}
            <td className="num">{fmtDec(d.protein)}</td>
            <td className="num">{fmtDec(d.carbs)}</td>
            <td className="num">{fmtDec(d.fat)}</td>
          </>
        ) : (
          <td colSpan={cols - 1} className="report-empty">
            sem registro
          </td>
        )}
      </tr>
      {foods && d.registered && (d.meals ?? []).length > 0 && (
        <tr className="report-foods-row">
          <td colSpan={cols}>
            {(d.meals ?? []).map((m) => (
              <span key={m.type} className="report-foods-line">
                <strong>{MEAL_LABEL[m.type] ?? m.type}:</strong> {m.items.map((i) => `${i.name} (${fmtDec(i.grams)} g)`).join(', ')}
              </span>
            ))}
          </td>
        </tr>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { dayTitle } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useAdaptiveStatus } from '@/lib/hooks';
import { MEAL_LABEL } from '@/lib/labels';
import { balanceText, periodLabel, signedKg, WEEKLY_DISCLAIMER } from '@/lib/reports';
import type { WeeklyHighlight, WeeklyReport, WorkoutType } from '@/lib/types';
import { WORKOUT_LABEL } from '@/lib/workouts';
import { AdaptiveSheet } from './AdaptiveSheet';
import { Sheet } from './Sheet';
import { WeeklyBars } from './WeeklyBars';

const WEIGHT_NOTE: Record<string, string> = {
  needTwoThisWeek: 'Para comparar o peso, registre pelo menos 2 pesagens na semana.',
  needPreviousWeek: 'Para comparar o peso, é preciso ao menos 1 pesagem na semana anterior.',
};

function highlightText(h: WeeklyHighlight) {
  if (h.kind === 'topProtein') return `Mais proteína: ${dayTitle(h.date)}, com ${fmtDec(h.protein)} g.`;
  if (h.kind === 'mealShare') return `${MEAL_LABEL[h.mealType]} concentrou ${Math.round(h.share * 100)}% das calorias da semana.`;
  return `${h.days} dias seguidos com registro.`;
}

/** Relatório completo de uma semana, numa folha. Calculado no servidor, sem IA. */
export function WeeklyReportSheet({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
  const { hideCalories: hide } = useDisplayPrefs();
  const { data, error, isLoading } = useSWR<WeeklyReport>(`/reports/weekly?week=${weekStart}`, { revalidateOnFocus: false });

  return (
    <Sheet open title="Relatório da semana" onClose={onClose}>
      <div className="stack-lg weekly-report">
        {data && <p className="caption">{periodLabel(data.weekStart, data.weekEnd)}</p>}

        {error ? (
          <p className="alert" role="alert">
            {error.message}
          </p>
        ) : isLoading || !data ? (
          <div className="stack" aria-busy="true">
            <div className="skeleton" style={{ height: 140 }} />
            <div className="skeleton" style={{ height: 64 }} />
          </div>
        ) : (
          <ReportBody report={data} hide={hide} />
        )}

        {!hide && <AdaptiveHint />}

        <p className="caption weekly-disclaimer">{WEEKLY_DISCLAIMER}</p>
      </div>
    </Sheet>
  );
}

function ReportBody({ report: r, hide }: { report: WeeklyReport; hide: boolean }) {
  const dots = (
    <p className="body-2">
      {r.loggedDays} de 7 dias registrados
    </p>
  );

  if (r.insufficientData) {
    return (
      <>
        {!hide && <WeeklyBars days={r.days} />}
        {dots}
        <section className="card glass stack-sm">
          <p className="headline">Registros da semana</p>
          <p className="body-2">
            O relatório completo aparece quando há pelo menos 4 dias registrados na semana. Dias sem registro não entram nas médias.
          </p>
        </section>
        <WorkoutsSection workouts={r.workouts} />
      </>
    );
  }

  const avg = r.avg!;
  const targets = r.targets!;
  const exp = r.balanceVsExpenditure!;
  // Sem calorias, os destaques que citam calorias (parte das calorias por refeição) ficam de fora
  const highlights = (r.highlights ?? []).filter((h) => !(hide && h.kind === 'mealShare'));

  return (
    <>
      {!hide && <WeeklyBars days={r.days} />}
      {dots}

      <section className="card glass stack-sm" aria-label="Médias por dia registrado">
        <h3 className="headline">Média por dia registrado</h3>
        <div className="weekly-stats">
          {!hide && <Stat label="kcal" value={fmtInt(avg.kcal)} goal={fmtInt(targets.kcal)} />}
          <Stat label="Proteína" value={`${fmtDec(avg.protein)} g`} goal={`${fmtInt(targets.protein)} g`} color="var(--ring-protein)" />
          <Stat label="Carbo." value={`${fmtDec(avg.carbs)} g`} goal={`${fmtInt(targets.carbs)} g`} color="var(--ring-carbs)" />
          <Stat label="Gord." value={`${fmtDec(avg.fat)} g`} goal={`${fmtInt(targets.fat)} g`} color="var(--ring-fat)" />
        </div>
        <p className="caption">
          {hide
            ? `Proteína em 90% ou mais da meta: ${r.daysProteinHit} de ${r.loggedDays} dias`
            : `Na meta (±10%): ${r.daysOnTarget} de ${r.loggedDays} dias · Proteína em 90% ou mais da meta: ${r.daysProteinHit} de ${r.loggedDays}`}
        </p>
      </section>

      {!hide && (
        <section className="card glass stack-sm" aria-label="Balanço">
          <h3 className="headline">Balanço da semana</h3>
          <p className="body-2">{balanceText(r.balanceVsTargetKcal!, 'da meta')}</p>
          <p className="body-2">
            {balanceText(exp.kcal, 'do gasto estimado')}
            {exp.kg !== null && ` (≈ ${Math.abs(exp.kg).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg, estimativa)`}
          </p>
          <p className="caption">Só os dias registrados entram na conta. O gasto é uma estimativa do seu perfil.</p>
        </section>
      )}

      {r.weightNote !== 'hidden' && (
        <section className="card glass stack-sm" aria-label="Peso">
          <h3 className="headline">Peso</h3>
          {r.weight ? (
            <>
              <p className="body-2">
                Média desta semana: {fmtDec(r.weight.thisWeekKg)} kg · semana anterior: {fmtDec(r.weight.previousWeekKg)} kg
              </p>
              <div className="weekly-pair">
                <div className="stat">
                  <span className="caption">Medido</span>
                  <strong>{signedKg(r.weight.measuredKg)}</strong>
                </div>
                {!hide && r.weight.expectedKg !== null && (
                  <div className="stat">
                    <span className="caption">Esperado pelo balanço</span>
                    <strong>{signedKg(r.weight.expectedKg)}</strong>
                  </div>
                )}
              </div>
              <p className="caption">Uma semana é pouco tempo: o peso muda com água, sal e rotina.</p>
            </>
          ) : (
            <p className="body-2">{r.weightNote ? WEIGHT_NOTE[r.weightNote] : 'Peso indisponível.'}</p>
          )}
        </section>
      )}

      <WorkoutsSection workouts={r.workouts} />

      {highlights.length > 0 && (
        <section className="card glass stack-sm" aria-label="Destaques">
          <h3 className="headline">Destaques</h3>
          <ul className="weekly-highlights">
            {highlights.map((h) => (
              <li key={h.kind} className="body-2">
                {highlightText(h)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.lowIntakeNote && !hide && (
        <p className="note">
          A média de calorias desta semana ficou abaixo do mínimo que o Bocado usa como referência nas metas. Se foi de propósito,
          tudo bem; se tiver dúvidas, um nutricionista ou médico pode ajudar.
        </p>
      )}
    </>
  );
}

function Stat({ label, value, goal, color }: { label: string; value: string; goal: string; color?: string }) {
  return (
    <div className="stat">
      <span className="caption" style={color ? { color } : undefined}>
        {label}
      </span>
      <strong>{value}</strong>
      <span className="caption">meta {goal}</span>
    </div>
  );
}

/** Bloco discreto: só aparece quando há uma sugestão de ajuste de meta. */
function AdaptiveHint() {
  const { data } = useAdaptiveStatus();
  const [open, setOpen] = useState(false);
  if (data?.state !== 'suggestion' || !data.suggestion) return null;
  return (
    <>
      <button type="button" className="adaptive-hint" onClick={() => setOpen(true)}>
        <span className="list-row-main">
          <span className="list-row-title">Ajuste de meta sugerido</span>
          <span className="list-row-sub">
            {fmtInt(data.suggestion.currentKcal)} → {fmtInt(data.suggestion.newKcal)} kcal por dia
          </span>
        </span>
        <span aria-hidden>›</span>
      </button>
      {open && <AdaptiveSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** "3 treinos, 160 min", com o detalhamento por tipo ao abrir. Semana sem treino: tom neutro. */
function WorkoutsSection({ workouts }: { workouts: WeeklyReport['workouts'] }) {
  if (!workouts) return null;
  const types = Object.entries(workouts.byType) as [WorkoutType, { count: number; minutes: number }][];
  return (
    <section className="card glass stack-sm" aria-label="Treinos">
      <h3 className="headline">Treinos</h3>
      {workouts.count === 0 ? (
        <p className="body-2">Nenhum treino registrado</p>
      ) : (
        <>
          <p className="body-2">
            {workouts.count} {workouts.count === 1 ? 'treino' : 'treinos'}, {workouts.totalMinutes} min
          </p>
          <details className="adaptive-how">
            <summary>Ver por tipo</summary>
            <ul className="weekly-highlights">
              {types.map(([type, v]) => (
                <li key={type} className="body-2">
                  {WORKOUT_LABEL[type]}: {v.count} {v.count === 1 ? 'treino' : 'treinos'}, {v.minutes} min
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

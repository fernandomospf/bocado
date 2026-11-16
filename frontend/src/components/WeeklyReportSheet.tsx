'use client';

import useSWR from 'swr';
import { dayTitle } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { MEAL_LABEL } from '@/lib/labels';
import { balanceText, periodLabel, signedKg, WEEKLY_DISCLAIMER } from '@/lib/reports';
import type { WeeklyHighlight, WeeklyReport } from '@/lib/types';
import { Sheet } from './Sheet';
import { WeeklyBars } from './WeeklyBars';

const WEIGHT_NOTE: Record<string, string> = {
  needTwoThisWeek: 'Para comparar o peso, registre pelo menos 2 pesagens na semana.',
  needPreviousWeek: 'Para comparar o peso, faltou ao menos 1 pesagem na semana anterior.',
};

function highlightText(h: WeeklyHighlight) {
  if (h.kind === 'topProtein') return `Mais proteína: ${dayTitle(h.date)}, com ${fmtDec(h.protein)} g.`;
  if (h.kind === 'mealShare') return `${MEAL_LABEL[h.mealType]} concentrou ${Math.round(h.share * 100)}% das calorias da semana.`;
  return `${h.days} dias seguidos com registro.`;
}

/** Relatório completo de uma semana, numa folha. Calculado no servidor, sem IA. */
export function WeeklyReportSheet({ weekStart, onClose }: { weekStart: string; onClose: () => void }) {
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
          <ReportBody report={data} />
        )}

        <p className="caption weekly-disclaimer">{WEEKLY_DISCLAIMER}</p>
      </div>
    </Sheet>
  );
}

function ReportBody({ report: r }: { report: WeeklyReport }) {
  const dots = (
    <p className="body-2">
      {r.loggedDays} de 7 dias registrados
    </p>
  );

  if (r.insufficientData) {
    return (
      <>
        <WeeklyBars days={r.days} />
        {dots}
        <section className="card glass stack-sm">
          <p className="headline">Poucos dias registrados</p>
          <p className="body-2">
            O relatório aparece com pelo menos 4 dias registrados na semana. Dias sem registro não entram nas médias.
          </p>
        </section>
      </>
    );
  }

  const avg = r.avg!;
  const targets = r.targets!;
  const exp = r.balanceVsExpenditure!;

  return (
    <>
      <WeeklyBars days={r.days} />
      {dots}

      <section className="card glass stack-sm" aria-label="Médias por dia registrado">
        <h3 className="headline">Média por dia registrado</h3>
        <div className="weekly-stats">
          <Stat label="kcal" value={fmtInt(avg.kcal)} goal={fmtInt(targets.kcal)} />
          <Stat label="Proteína" value={`${fmtDec(avg.protein)} g`} goal={`${fmtInt(targets.protein)} g`} color="var(--ring-protein)" />
          <Stat label="Carbo." value={`${fmtDec(avg.carbs)} g`} goal={`${fmtInt(targets.carbs)} g`} color="var(--ring-carbs)" />
          <Stat label="Gord." value={`${fmtDec(avg.fat)} g`} goal={`${fmtInt(targets.fat)} g`} color="var(--ring-fat)" />
        </div>
        <p className="caption">
          Na meta (±10%): {r.daysOnTarget} de {r.loggedDays} dias · Proteína em 90% ou mais da meta: {r.daysProteinHit} de {r.loggedDays}
        </p>
      </section>

      <section className="card glass stack-sm" aria-label="Balanço">
        <h3 className="headline">Balanço da semana</h3>
        <p className="body-2">{balanceText(r.balanceVsTargetKcal!, 'da meta')}</p>
        <p className="body-2">
          {balanceText(exp.kcal, 'do gasto estimado')}
          {exp.kg !== null && ` (≈ ${Math.abs(exp.kg).toLocaleString('pt-BR', { minimumFractionDigits: 1 })} kg, estimativa)`}
        </p>
        <p className="caption">Só os dias registrados entram na conta. O gasto é uma estimativa do seu perfil.</p>
      </section>

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
                {r.weight.expectedKg !== null && (
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

      {r.highlights && r.highlights.length > 0 && (
        <section className="card glass stack-sm" aria-label="Destaques">
          <h3 className="headline">Destaques</h3>
          <ul className="weekly-highlights">
            {r.highlights.map((h) => (
              <li key={h.kind} className="body-2">
                {highlightText(h)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {r.lowIntakeNote && (
        <p className="note">
          A média de calorias desta semana ficou abaixo do mínimo que o Bocado usa nas metas. Se isso foi de propósito ou se
          você tem dúvidas, vale conversar com um nutricionista ou médico.
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

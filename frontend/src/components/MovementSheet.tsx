'use client';

import useSWR from 'swr';
import { dayMonth, fromISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { movementView } from '@/lib/gaugeModel';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useLastWorkout, useMovementWeek } from '@/lib/hooks';
import type { Workout } from '@/lib/types';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { INTENSITY_LABEL, WORKOUT_LABEL } from '@/lib/workouts';
import { HalfGauge } from './HalfGauge';
import { MovementGoalControls } from './MovementGoalControls';
import { useQuickSheets } from './QuickSheets';
import { Sheet } from './Sheet';
import { WorkoutTypeIcon } from './WorkoutTypeIcon';

const weekday = (iso: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(fromISO(iso)).replace('.', '');

/**
 * "Movimento da semana": arco maior, barrinhas por dia (tons neutros), treinos da semana, estimativa opcional,
 * registrar/repetir e a meta. Sem prazos nem cobrança em dias de descanso.
 */
export function MovementSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: week } = useMovementWeek(date);
  const { hideCalories } = useDisplayPrefs();
  const { openWorkout } = useQuickSheets();
  const { data: last } = useLastWorkout();
  const { repeat } = useWorkoutActions();
  const { data: list } = useSWR<{ workouts: Workout[] }>(week ? `/workouts?from=${week.weekStart}&to=${week.weekEnd}` : null);

  const view = week ? movementView({ doneMin: week.doneMin, goalMin: week.goalMin }) : null;
  const maxDay = Math.max(1, ...(week?.byDay.map((d) => d.minutes) ?? [0]));
  const estimate = !hideCalories && week?.estimateKcal != null ? week.estimateKcal : null;

  return (
    <Sheet open title="Movimento da semana" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Movimento da semana</h2>
          {week && (
            <p className="caption">
              {dayMonth(week.weekStart)} a {dayMonth(week.weekEnd)}
            </p>
          )}
        </div>

        {week && view ? (
          <>
            <div className="move-hero">
              <div className="move-hero-gauge">
                <HalfGauge arcs={view.arcs} size={200} strokeWidth={14} />
              </div>
              <p className="title num">
                {week.goalMin !== null ? `${fmtInt(week.doneMin)} de ${fmtInt(week.goalMin)} min` : `${fmtInt(week.doneMin)} min`}
              </p>
              {week.goalMin !== null && (
                <p className="body-2">{week.reached ? 'Meta da semana batida' : `Faltam ${fmtInt(week.remainingMin ?? 0)} min`}</p>
              )}
              <p className="caption">Dias de descanso também contam: o corpo precisa deles.</p>
            </div>

            <div
              className="move-bars"
              role="img"
              aria-label={`Minutos por dia: ${week.byDay.map((d) => `${weekday(d.date)} ${d.minutes} min`).join('; ')}`}
            >
              {week.byDay.map((d) => (
                <div key={d.date} className="move-bar">
                  <span className="move-bar-track">
                    <span className="move-bar-fill" style={{ transform: `scaleY(${d.minutes / maxDay})` }} />
                  </span>
                  <span className="move-bar-label">{weekday(d.date)}</span>
                </div>
              ))}
            </div>

            {estimate !== null && (
              <div className="stack" style={{ gap: 2 }}>
                <p className="body-2 num">Gasto estimado da semana: ≈ {fmtInt(estimate)} kcal</p>
                <p className="caption">Estimativa aproximada; pode errar bastante. Não é um valor para compensar o que você comeu.</p>
              </div>
            )}

            <div className="stack-sm">
              <h3 className="headline">Treinos da semana</h3>
              {list && list.workouts.length === 0 && <p className="caption">Nenhum treino registrado nesta semana.</p>}
              {list && list.workouts.length > 0 && (
                <div className="list">
                  {list.workouts.map((w) => (
                    <button key={w.id} type="button" className="list-row" onClick={() => openWorkout({ date: w.date, workout: w })}>
                      <span className="workout-icon">
                        <WorkoutTypeIcon type={w.type} width={18} height={18} />
                      </span>
                      <span className="list-row-main">
                        <span className="list-row-title" style={{ display: 'block' }}>
                          {WORKOUT_LABEL[w.type]} · {w.durationMin} min
                        </span>
                        <span className="list-row-sub">
                          {weekday(w.date)} · {INTENSITY_LABEL[w.intensity].toLowerCase()}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!list && <div className="skeleton" style={{ height: 44 }} />}
            </div>

            <div className="stack">
              <button type="button" className="btn btn-primary btn-block" onClick={() => openWorkout({ date })}>
                Registrar treino
              </button>
              {last && (
                <button type="button" className="btn btn-glass btn-block" onClick={() => void repeat(last.id, date)}>
                  Repetir último treino
                </button>
              )}
            </div>

            <div className="stack-sm">
              <h3 className="headline">Meta</h3>
              <MovementGoalControls />
            </div>
          </>
        ) : (
          <div className="skeleton" style={{ height: 160 }} />
        )}
      </div>
    </Sheet>
  );
}

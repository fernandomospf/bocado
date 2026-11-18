'use client';

import { fromISO, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { movementView } from '@/lib/gaugeModel';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useDay, useLastWorkout, useMovementWeek } from '@/lib/hooks';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { INTENSITY_LABEL, WORKOUT_LABEL } from '@/lib/workouts';
import { HalfGauge } from './HalfGauge';
import { MovementGoalControls } from './MovementGoalControls';
import { useQuickSheets } from './QuickSheets';
import { Sheet } from './Sheet';
import { WorkoutTypeIcon } from './WorkoutTypeIcon';

const weekday = (iso: string) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(fromISO(iso)).replace('.', '');

/** "60 de 30 min", "Descanso" ou "60 min" (sem meta, ou descanso com treino). */
function heroText(m: { minutes: number; goalMin: number | null; restDay: boolean }) {
  if (m.restDay && m.minutes <= 0) return 'Descanso';
  if (!m.restDay && m.goalMin !== null) return `${fmtInt(m.minutes)} de ${fmtInt(m.goalMin)} min`;
  return `${fmtInt(m.minutes)} min`;
}

/**
 * "Movimento" do dia mostrado: arco grande (minutos / meta diária), a semana em uma linha, os treinos do dia,
 * registrar/repetir, a estimativa opcional e os ajustes (meta diária e dias de descanso). Sem cobrança.
 */
export function MovementSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { data: day } = useDay(date);
  const { data: week } = useMovementWeek(date);
  const { hideCalories } = useDisplayPrefs();
  const { openWorkout } = useQuickSheets();
  const { data: last } = useLastWorkout();
  const { repeat } = useWorkoutActions();

  const movement = day?.movement;
  const view = movement ? movementView({ ...movement, hideCalories, isToday: date === todayISO() }) : null;
  const estimate = !hideCalories && movement?.estimateKcal != null && movement.estimateKcal > 0 ? movement.estimateKcal : null;
  const maxDay = Math.max(1, ...(week?.byDay.map((d) => d.minutes) ?? [0]));
  const weekLine = week
    ? week.daysReached !== null
      ? `Esta semana: meta batida em ${week.daysReached} de ${week.activeDays} ${week.activeDays === 1 ? 'dia ativo' : 'dias ativos'} · ${fmtInt(week.doneMin)} min no total`
      : `Esta semana: ${fmtInt(week.doneMin)} min no total`
    : null;

  return (
    <Sheet open title="Movimento" onClose={onClose}>
      <div className="stack-lg">
        <h2 className="title">Movimento</h2>

        {movement && view ? (
          <>
            <div className="move-hero">
              <div className="move-hero-gauge">
                <HalfGauge arcs={view.arcs} size={200} strokeWidth={14} />
              </div>
              <p className="title num" aria-label={view.ariaLabel}>
                {heroText(movement)}
              </p>
              {weekLine && <p className="body-2 num">{weekLine}</p>}
              <p className="caption">Dias de descanso também contam.</p>
            </div>

            {week && (
              <div
                className="move-bars"
                role="img"
                aria-label={`Minutos por dia: ${week.byDay.map((d) => `${weekday(d.date)} ${d.restDay && d.minutes === 0 ? 'descanso' : `${d.minutes} min`}`).join('; ')}`}
              >
                {week.byDay.map((d) => (
                  <div key={d.date} className={`move-bar${d.restDay ? ' move-bar-rest' : ''}`}>
                    <span className="move-bar-track">
                      <span className="move-bar-fill" style={{ transform: `scaleY(${d.minutes / maxDay})` }} />
                    </span>
                    <span className="move-bar-label">{weekday(d.date)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="stack-sm">
              <h3 className="headline">Treinos do dia</h3>
              {day.workouts.length === 0 ? (
                <p className="caption">Nenhum treino registrado neste dia.</p>
              ) : (
                <div className="list">
                  {day.workouts.map((w) => (
                    <button key={w.id} type="button" className="list-row" onClick={() => openWorkout({ date, workout: w })}>
                      <span className="workout-icon">
                        <WorkoutTypeIcon type={w.type} width={18} height={18} />
                      </span>
                      <span className="list-row-main">
                        <span className="list-row-title" style={{ display: 'block' }}>
                          {WORKOUT_LABEL[w.type]} · {w.durationMin} min
                        </span>
                        <span className="list-row-sub">{INTENSITY_LABEL[w.intensity]}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
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

            {estimate !== null && (
              <div className="stack" style={{ gap: 2 }}>
                <p className="body-2 num">Gasto estimado do dia: ≈ {fmtInt(estimate)} kcal</p>
                <p className="caption">Estimativa aproximada; pode errar bastante. Não é um valor para compensar o que você comeu.</p>
              </div>
            )}

            <div className="stack-sm">
              <h3 className="headline">Ajustes</h3>
              <MovementGoalControls showToggle={false} />
            </div>
          </>
        ) : (
          <div className="skeleton" style={{ height: 160 }} />
        )}
      </div>
    </Sheet>
  );
}

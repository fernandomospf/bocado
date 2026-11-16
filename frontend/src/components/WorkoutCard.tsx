'use client';

import { useState } from 'react';
import { fmtInt } from '@/lib/format';
import { useLastWorkout } from '@/lib/hooks';
import type { DayWorkout } from '@/lib/types';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { INTENSITY_LABEL, WORKOUT_LABEL, workoutSummary } from '@/lib/workouts';
import { PlusIcon, RepeatIcon } from './Icons';
import { WorkoutSheet } from './WorkoutSheet';
import { WorkoutTypeIcon } from './WorkoutTypeIcon';

/**
 * Treino do dia, abaixo das refeições. É contexto: nunca entra nos anéis nem aparece como "calorias queimadas".
 * A estimativa só aparece com a preferência ligada, sempre rotulada como estimativa.
 */
export function WorkoutCard({ date, workouts, loading }: { date: string; workouts: DayWorkout[]; loading: boolean }) {
  const { data: last } = useLastWorkout();
  const { repeat } = useWorkoutActions();
  const [sheet, setSheet] = useState<{ workout: DayWorkout | null } | null>(null);
  const [repeating, setRepeating] = useState(false);

  async function repeatLast() {
    if (!last || repeating) return;
    setRepeating(true);
    try {
      await repeat(last.id, date);
    } finally {
      setRepeating(false);
    }
  }

  return (
    <section className="card glass workout-card" aria-label="Treino">
      <div className="meal-head">
        <h3 className="headline">Treino</h3>
      </div>

      {loading ? (
        <div className="skeleton" style={{ height: 40 }} />
      ) : workouts.length === 0 ? (
        <div className="empty-actions">
          <button type="button" className="empty-add" onClick={() => setSheet({ workout: null })}>
            <PlusIcon width={18} height={18} />
            Registrar treino
          </button>
          {last && (
            <button type="button" className="empty-add" onClick={() => void repeatLast()} disabled={repeating}>
              <RepeatIcon width={18} height={18} />
              Repetir último treino · {workoutSummary(last)}
            </button>
          )}
        </div>
      ) : (
        <div className="list">
          {workouts.map((w) => (
            <button key={w.id} type="button" className="list-row" onClick={() => setSheet({ workout: w })}>
              <span className="workout-icon">
                <WorkoutTypeIcon type={w.type} width={20} height={20} />
              </span>
              <span className="list-row-main">
                <span className="list-row-title" style={{ display: 'block' }}>
                  {WORKOUT_LABEL[w.type]}
                </span>
                <span className="list-row-sub">
                  {w.durationMin} min · {INTENSITY_LABEL[w.intensity]}
                  {w.estimateKcal !== undefined && ` · ≈ ${fmtInt(w.estimateKcal)} kcal (estimativa)`}
                </span>
              </span>
            </button>
          ))}
          <button type="button" className="empty-add" style={{ marginTop: 6 }} onClick={() => setSheet({ workout: null })}>
            <PlusIcon width={18} height={18} />
            Adicionar treino
          </button>
        </div>
      )}

      {sheet && <WorkoutSheet date={date} workout={sheet.workout} onClose={() => setSheet(null)} />}
    </section>
  );
}

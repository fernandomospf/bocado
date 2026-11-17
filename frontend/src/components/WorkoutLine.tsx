'use client';

import { fmtInt } from '@/lib/format';
import type { DayWorkout } from '@/lib/types';
import { INTENSITY_LABEL, WORKOUT_LABEL } from '@/lib/workouts';
import { useQuickSheets } from './QuickSheets';
import { WorkoutTypeIcon } from './WorkoutTypeIcon';

/**
 * Linhas compactas dos treinos do dia, dentro do dropdown Atividades da Hoje. Sem treino no dia, não mostra nada.
 * É contexto: fica fora dos medidores, e a estimativa só aparece com a preferência ligada, sempre como estimativa.
 */
export function WorkoutLine({ date, workouts }: { date: string; workouts: DayWorkout[] }) {
  const { openWorkout } = useQuickSheets();
  if (workouts.length === 0) return null;

  return (
    <section className="stack-sm workout-lines" aria-label="Treino do dia">
      {workouts.map((w) => (
        <button key={w.id} type="button" className="workout-line glass" onClick={() => openWorkout({ date, workout: w })}>
          <span className="workout-icon">
            <WorkoutTypeIcon type={w.type} width={20} height={20} />
          </span>
          <span className="list-row-main">
            <span className="list-row-title" style={{ display: 'block' }}>
              {WORKOUT_LABEL[w.type]} · {w.durationMin} min · {INTENSITY_LABEL[w.intensity].toLowerCase()}
            </span>
            {w.estimateKcal !== undefined && <span className="list-row-sub">≈ {fmtInt(w.estimateKcal)} kcal (estimativa)</span>}
          </span>
        </button>
      ))}
    </section>
  );
}

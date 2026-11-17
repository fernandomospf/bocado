'use client';

import { useDisplayPrefs } from '@/lib/display-prefs';
import { useMovementPrefs } from '@/lib/useMovement';
import { MovementGoalControls } from './MovementGoalControls';

/** Perfil > Preferências > Movimento: medidor, meta semanal e a estimativa de gasto (aproximada). */
export function MovementPrefs() {
  const { profile, save } = useMovementPrefs();
  const { hideCalories } = useDisplayPrefs();
  if (!profile) return null;

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }} id="movimento">
        Movimento
      </h3>
      <MovementGoalControls />
      {/* Estimativa é só de calorias: oculta enquanto o modo "esconder calorias" estiver ativo */}
      {!hideCalories && (
        <>
          <label className="switch-row">
            <span>Mostrar gasto estimado dos treinos</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={profile.workoutEstimateEnabled}
              onChange={(e) => void save({ workoutEstimateEnabled: e.target.checked })}
            />
          </label>
          <p className="caption">É uma estimativa aproximada, que pode errar bastante.</p>
        </>
      )}
    </>
  );
}

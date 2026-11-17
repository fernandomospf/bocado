'use client';

import { useId } from 'react';
import { MOVEMENT_GOAL_DEFAULT, MOVEMENT_GOAL_MAX, MOVEMENT_GOAL_MIN, stepGoal } from '@/lib/movement';
import { useMovementPrefs } from '@/lib/useMovement';

/** Meta semanal (stepper de 15 em 15, de 30 a 600) e "Mostrar medidor de movimento". Usado na folha e no Perfil. */
export function MovementGoalControls({ showToggle = true }: { showToggle?: boolean }) {
  const id = useId();
  const { profile, save } = useMovementPrefs();
  if (!profile) return null;
  const goal = profile.movementGoalMin;

  return (
    <div className="stack">
      {showToggle && (
        <label className="switch-row">
          <span>Mostrar medidor de movimento</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={profile.movementEnabled}
            onChange={(e) => void save({ movementEnabled: e.target.checked })}
          />
        </label>
      )}

      <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
        <span className="body-2" id={`${id}-goal`}>
          Meta semanal
        </span>
        {goal === null ? (
          <button type="button" className="btn btn-glass" onClick={() => void save({ movementGoalMin: MOVEMENT_GOAL_DEFAULT })}>
            Definir meta
          </button>
        ) : (
          <div className="stepper" role="group" aria-labelledby={`${id}-goal`}>
            <button
              type="button"
              className="stepper-btn"
              aria-label="Diminuir 15 minutos"
              disabled={goal <= MOVEMENT_GOAL_MIN}
              onClick={() => void save({ movementGoalMin: stepGoal(goal, -1) })}
            >
              −
            </button>
            <output className="stepper-value num" aria-live="polite">
              {goal} min
            </output>
            <button
              type="button"
              className="stepper-btn"
              aria-label="Aumentar 15 minutos"
              disabled={goal >= MOVEMENT_GOAL_MAX}
              onClick={() => void save({ movementGoalMin: stepGoal(goal, 1) })}
            >
              +
            </button>
          </div>
        )}
      </div>
      <p className="caption">150 minutos por semana é uma referência geral para adultos. Ajuste ao seu ritmo.</p>
      {goal !== null && (
        <button type="button" className="btn btn-plain" style={{ alignSelf: 'flex-start', paddingInline: 0 }} onClick={() => void save({ movementGoalMin: null })}>
          Acompanhar sem meta (só os minutos)
        </button>
      )}
    </div>
  );
}

'use client';

import { useId } from 'react';
import { MOVEMENT_GOAL_DEFAULT, MOVEMENT_GOAL_MAX, MOVEMENT_GOAL_MIN, MOVEMENT_GOAL_STEP, REST_DAY_CHIPS, stepGoal, toggleRestDay } from '@/lib/movement';
import { useMovementPrefs } from '@/lib/useMovement';

/**
 * Meta DIÁRIA (stepper de 5 em 5, de 15 a 240), dias de descanso (chips Seg a Dom) e, opcionalmente,
 * "Mostrar medidor de movimento". Usado na folha de Movimento e no Perfil.
 */
export function MovementGoalControls({ showToggle = true }: { showToggle?: boolean }) {
  const id = useId();
  const { profile, save } = useMovementPrefs();
  if (!profile) return null;
  const goal = profile.movementDailyGoalMin;
  const rest = profile.movementRestDays ?? [];

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
          Meta diária (min)
        </span>
        {goal === null ? (
          <button type="button" className="btn btn-glass" onClick={() => void save({ movementDailyGoalMin: MOVEMENT_GOAL_DEFAULT })}>
            Definir meta
          </button>
        ) : (
          <div className="stepper" role="group" aria-labelledby={`${id}-goal`}>
            <button
              type="button"
              className="stepper-btn"
              aria-label={`Diminuir ${MOVEMENT_GOAL_STEP} minutos`}
              disabled={goal <= MOVEMENT_GOAL_MIN}
              onClick={() => void save({ movementDailyGoalMin: stepGoal(goal, -1) })}
            >
              −
            </button>
            <output className="stepper-value num" aria-live="polite">
              {goal} min
            </output>
            <button
              type="button"
              className="stepper-btn"
              aria-label={`Aumentar ${MOVEMENT_GOAL_STEP} minutos`}
              disabled={goal >= MOVEMENT_GOAL_MAX}
              onClick={() => void save({ movementDailyGoalMin: stepGoal(goal, 1) })}
            >
              +
            </button>
          </div>
        )}
      </div>

      <div className="stack-sm">
        <span className="body-2" id={`${id}-rest`}>
          Dias de descanso
        </span>
        <div className="rest-days" role="group" aria-labelledby={`${id}-rest`}>
          {REST_DAY_CHIPS.map((d) => {
            const on = rest.includes(d.day);
            return (
              <button
                key={d.day}
                type="button"
                className="chip chip-toggle rest-day-chip"
                aria-pressed={on}
                aria-label={`${d.long}: ${on ? 'descanso' : 'dia ativo'}`}
                onClick={() => void save({ movementRestDays: toggleRestDay(rest, d.day) })}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>
      <p className="caption">30 minutos por dia é uma referência geral para adultos. Ajuste ao seu ritmo; nos dias de descanso não há meta.</p>
      {goal !== null && (
        <button
          type="button"
          className="btn btn-plain"
          style={{ alignSelf: 'flex-start', paddingInline: 0 }}
          onClick={() => void save({ movementDailyGoalMin: null })}
        >
          Acompanhar sem meta (só os minutos)
        </button>
      )}
    </div>
  );
}

'use client';

import { useId, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { dayTitle, isValidISO, todayISO } from '@/lib/date';
import { useLastWorkout } from '@/lib/hooks';
import type { DayWorkout, Workout, WorkoutIntensity, WorkoutType } from '@/lib/types';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { INTENSITIES, QUICK_DURATIONS, WORKOUT_TYPES, workoutSummary } from '@/lib/workouts';
import { Sheet } from './Sheet';
import { WorkoutTypeIcon } from './WorkoutTypeIcon';

interface WorkoutSheetProps {
  /** Dia da tela (padrão da data do treino novo). */
  date: string;
  /** Com `workout`, edita (e permite excluir); sem ele, registra um novo. */
  workout?: DayWorkout | null;
  onClose: () => void;
}

/** Registrar treino: tipo, duração e intensidade. Quem repete o padrão só abre e salva (o último vem pré-selecionado). */
export function WorkoutSheet(props: WorkoutSheetProps) {
  const { data: last, isLoading } = useLastWorkout();
  // Espera o "último treino" chegar para pré-selecionar sem piscar (só no registro novo)
  if (!props.workout && isLoading) return null;
  return <WorkoutForm {...props} last={last ?? null} />;
}

function WorkoutForm({ date: screenDate, workout, last, onClose }: WorkoutSheetProps & { last: Workout | null }) {
  const id = useId();
  const { refresh, announceCreated, remove } = useWorkoutActions();
  const today = todayISO();
  const editing = !!workout;
  const seed = workout ?? last;

  const [type, setType] = useState<WorkoutType>(seed?.type ?? 'STRENGTH');
  const [duration, setDuration] = useState(String(seed?.durationMin ?? 60));
  const [intensity, setIntensity] = useState<WorkoutIntensity>(seed?.intensity ?? 'MODERATE');
  const [note, setNote] = useState(workout?.note ?? '');
  const [date, setDate] = useState(screenDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minutes = Number(duration);
  const validDuration = Number.isInteger(minutes) && minutes >= 5 && minutes <= 480;
  const hint = INTENSITIES.find((i) => i.value === intensity)?.hint;

  async function save() {
    if (!validDuration || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = { date, type, durationMin: minutes, intensity, note: note.trim() };
      if (editing) {
        await api(`/workouts/${workout!.id}`, { method: 'PATCH', json: body });
        await Promise.all([refresh(date), refresh(screenDate)]);
        onClose();
      } else {
        const created = await api<Workout>('/workouts', { method: 'POST', json: body });
        onClose();
        await announceCreated(created, `Treino registrado · ${workoutSummary(created)}`);
      }
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function del() {
    if (!workout || busy) return;
    setBusy(true);
    const ok = await remove(workout.id, screenDate);
    if (ok) onClose();
    else setBusy(false);
  }

  return (
    <Sheet open title={editing ? 'Editar treino' : 'Registrar treino'} onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="field">
          <span className="field-label" id={`${id}-type`}>
            Tipo
          </span>
          <div className="fat-chips" role="group" aria-labelledby={`${id}-type`}>
            {WORKOUT_TYPES.map((t) => (
              <button key={t.value} type="button" className="chip chip-toggle" aria-pressed={type === t.value} onClick={() => setType(t.value)}>
                <WorkoutTypeIcon type={t.value} width={18} height={18} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label" id={`${id}-dur`}>
            Duração
          </span>
          <div className="fat-chips" role="group" aria-labelledby={`${id}-dur`}>
            {QUICK_DURATIONS.map((d) => (
              <button key={d} type="button" className="chip chip-toggle" aria-pressed={minutes === d} onClick={() => setDuration(String(d))}>
                {d} min
              </button>
            ))}
          </div>
          <div className="input-suffix" style={{ marginTop: 8 }}>
            <input
              className="input num"
              inputMode="numeric"
              aria-label="Duração em minutos"
              value={duration}
              onChange={(e) => setDuration(e.target.value.replace(/\D/g, '').slice(0, 3))}
            />
            <span aria-hidden>min</span>
          </div>
          {!validDuration && duration !== '' && <p className="caption">Entre 5 e 480 minutos.</p>}
        </div>

        <div className="field">
          <span className="field-label" id={`${id}-int`}>
            Intensidade
          </span>
          <div className="segmented" role="group" aria-labelledby={`${id}-int`}>
            {INTENSITIES.map((i) => (
              <button key={i.value} type="button" aria-pressed={intensity === i.value} onClick={() => setIntensity(i.value)}>
                {i.label}
              </button>
            ))}
          </div>
          <p className="caption" aria-live="polite">
            {INTENSITIES.map((i) => `${i.label}: ${i.hint.toLowerCase()}`).join(' · ')}
          </p>
          <p className="sr-only">{hint}</p>
        </div>

        <label className="field">
          <span className="field-label">Nota (opcional)</span>
          <input className="input" value={note} maxLength={280} placeholder="Ex.: costas e bíceps" onChange={(e) => setNote(e.target.value)} />
        </label>

        <label className="field">
          <span className="field-label">Dia</span>
          <input className="input" type="date" value={date} max={today} onChange={(e) => isValidISO(e.target.value) && setDate(e.target.value)} />
        </label>
        {date !== screenDate && <p className="caption">Vai para {dayTitle(date)}</p>}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !validDuration}>
            {busy ? <span className="spinner" aria-label="Salvando" /> : editing ? 'Salvar' : 'Registrar treino'}
          </button>
          {editing && (
            <button type="button" className="btn btn-glass btn-block btn-danger" onClick={() => void del()} disabled={busy}>
              Excluir treino
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

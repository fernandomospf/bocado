import type { WorkoutIntensity, WorkoutType } from './types';

export const WORKOUT_TYPES: { value: WorkoutType; label: string }[] = [
  { value: 'STRENGTH', label: 'Musculação' },
  { value: 'RUN', label: 'Corrida' },
  { value: 'BIKE', label: 'Bike' },
  { value: 'WALK', label: 'Caminhada' },
  { value: 'OTHER', label: 'Outro' },
];

export const WORKOUT_LABEL = Object.fromEntries(WORKOUT_TYPES.map((t) => [t.value, t.label])) as Record<WorkoutType, string>;

export const INTENSITIES: { value: WorkoutIntensity; label: string; hint: string }[] = [
  { value: 'LIGHT', label: 'Leve', hint: 'Dá para conversar' },
  { value: 'MODERATE', label: 'Moderada', hint: 'Fala entrecortada' },
  { value: 'HARD', label: 'Forte', hint: 'Difícil de falar' },
];

export const INTENSITY_LABEL = Object.fromEntries(INTENSITIES.map((i) => [i.value, i.label])) as Record<WorkoutIntensity, string>;

export const QUICK_DURATIONS = [30, 45, 60, 90];

/** "Musculação, 60 min" */
export const workoutSummary = (w: { type: WorkoutType; durationMin: number }) => `${WORKOUT_LABEL[w.type]}, ${w.durationMin} min`;

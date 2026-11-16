'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { tap } from './haptics';
import type { Workout, WorkoutSnapshot } from './types';
import { useRevalidateDay } from './useRevalidateDay';
import { workoutSummary } from './workouts';

/** Repetir, excluir e desfazer treinos, com toast. Revalida o dia, o "último treino" e os relatórios. */
export function useWorkoutActions() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const revalidateDay = useRevalidateDay();

  const refresh = useCallback(
    async (date: string) => {
      await Promise.all([
        revalidateDay(date),
        mutate((key) => typeof key === 'string' && (key.startsWith('/workouts') || key.startsWith('/reports'))),
      ]);
    },
    [mutate, revalidateDay],
  );

  const undoRemove = useCallback(
    async (snapshot: WorkoutSnapshot) => {
      try {
        await api('/workouts/restore', { method: 'POST', json: { snapshot } });
        tap();
        await refresh(snapshot.workout.date);
        toast.show({ message: 'Treino de volta', durationMs: 2500 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        void refresh(snapshot.workout.date);
      }
    },
    [refresh, toast],
  );

  const remove = useCallback(
    async (id: string, date: string) => {
      try {
        const snapshot = await api<WorkoutSnapshot>(`/workouts/${id}`, { method: 'DELETE' });
        tap();
        await refresh(date);
        toast.show({ message: 'Treino removido', action: { label: 'Desfazer', onClick: () => void undoRemove(snapshot) } });
        return true;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return false;
      }
    },
    [refresh, toast, undoRemove],
  );

  /** Desfazer um treino recém-criado (registro ou repetição) = apagá-lo. */
  const undoCreate = useCallback(
    async (id: string, date: string) => {
      try {
        await api(`/workouts/${id}`, { method: 'DELETE' });
        tap();
        await refresh(date);
        toast.show({ message: 'Desfeito', durationMs: 2000 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
    },
    [refresh, toast],
  );

  const announceCreated = useCallback(
    async (w: Workout, message: string) => {
      tap();
      await refresh(w.date);
      toast.show({ message, action: { label: 'Desfazer', onClick: () => void undoCreate(w.id, w.date) } });
    },
    [refresh, toast, undoCreate],
  );

  /** "Repetir último treino": copia o último (sem a nota) para a data da tela. */
  const repeat = useCallback(
    async (lastId: string, date: string) => {
      try {
        const w = await api<Workout>(`/workouts/${lastId}/repeat`, { method: 'POST', json: { date } });
        await announceCreated(w, `Treino registrado · ${workoutSummary(w)}`);
        return w;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [announceCreated, toast],
  );

  return { repeat, remove, refresh, announceCreated };
}

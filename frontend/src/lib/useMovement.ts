'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { tap } from './haptics';
import { useProfile } from './hooks';
import type { Profile } from './types';

export type MovementPatch = Partial<Pick<Profile, 'movementEnabled' | 'movementDailyGoalMin' | 'movementRestDays' | 'workoutEstimateEnabled'>>;

/**
 * Salva preferências de movimento (otimista) e revalida a semana, os dias e os relatórios. A meta de movimento não muda
 * nenhuma meta de calorias, nem a adaptativa, nem a de água.
 */
export function useMovementPrefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();

  const save = useCallback(
    async (patch: MovementPatch) => {
      if (!profile) return false;
      tap();
      try {
        await mutate(async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: patch }), {
          optimisticData: {
            ...profile,
            ...patch,
            // Desligar a estimativa desliga a soma à meta junto (o servidor faz o mesmo)
            ...(patch.workoutEstimateEnabled === false ? { workoutAddToGoal: false } : {}),
          },
          rollbackOnError: true,
          revalidate: false,
        });
        // A meta diária, os descansos e a estimativa mudam o `movement` de cada dia e o relatório da semana
        void globalMutate(
          (key) =>
            typeof key === 'string' &&
            (key.startsWith('/workouts') ||
              key.startsWith('/days') ||
              key.startsWith('/reports') ||
              (patch.workoutEstimateEnabled !== undefined && key.startsWith('/suggestions'))),
        );
        return true;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return false;
      }
    },
    [globalMutate, mutate, profile, toast],
  );

  return { profile, save };
}

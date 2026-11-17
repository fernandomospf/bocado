'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { tap } from './haptics';
import { useProfile } from './hooks';
import type { Profile } from './types';

export type MovementPatch = Partial<Pick<Profile, 'movementEnabled' | 'movementGoalMin' | 'workoutEstimateEnabled'>>;

/**
 * Salva preferências de movimento (otimista) e revalida o resumo da semana e os dias. A meta de movimento não muda
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
        void globalMutate((key) => typeof key === 'string' && (key.startsWith('/workouts') || (patch.workoutEstimateEnabled !== undefined && (key.startsWith('/days') || key.startsWith('/suggestions')))));
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

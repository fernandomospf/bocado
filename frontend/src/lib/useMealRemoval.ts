'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { withoutItems } from './dayCache';
import { tap } from './haptics';
import { useRevalidateDay } from './useRevalidateDay';
import type { DaySummary, Meal, MealItem, MealSnapshot } from './types';

/**
 * Remover alimento ou refeição sem confirmação: some na hora (otimista), e o toast oferece "Desfazer",
 * que reenvia o snapshot devolvido pelo DELETE para POST /meals/restore.
 */
export function useMealRemoval() {
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const revalidate = useRevalidateDay();

  const undo = useCallback(
    async (snapshot: MealSnapshot, message: string) => {
      try {
        const res = await api<{ date: string }>('/meals/restore', { method: 'POST', json: { snapshot } });
        tap();
        await revalidate(res.date);
        toast.show({ message, durationMs: 2500 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        void revalidate(snapshot.meal.date);
      }
    },
    [revalidate, toast],
  );

  /** Sem `item`, remove a refeição inteira. */
  const remove = useCallback(
    async (meal: Meal, item?: MealItem) => {
      tap();
      void mutate<DaySummary>(`/days/${meal.date}`, (day) => day && withoutItems(day, meal.id, item && [item.id]), {
        revalidate: false,
      });
      let snapshot: MealSnapshot;
      try {
        snapshot = await api<MealSnapshot>(item ? `/meals/${meal.id}/items/${item.id}` : `/meals/${meal.id}`, {
          method: 'DELETE',
        });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        void revalidate(meal.date); // desfaz a remoção otimista
        return;
      }
      void revalidate(meal.date);
      toast.show({
        message: item ? 'Alimento removido' : 'Refeição removida',
        action: { label: 'Desfazer', onClick: () => void undo(snapshot, item ? 'Alimento de volta' : 'Refeição de volta') },
      });
    },
    [mutate, revalidate, toast, undo],
  );

  return { remove };
}

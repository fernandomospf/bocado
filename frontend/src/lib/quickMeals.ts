'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { tap } from './haptics';
import { MEAL_LABEL } from './labels';
import type { Meal, MealType, QuickItem } from './types';
import { useRevalidateDay } from './useRevalidateDay';

/** Mesma ideia do agrupamento do servidor (nome normalizado + gramas a 10), só para não repetir chip igual. */
export function quickKey(items: Pick<QuickItem, 'name' | 'grams'>[]) {
  return items
    .map((i) => `${i.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}:${Math.round(i.grams / 10) * 10}`)
    .sort()
    .join('|');
}

/** Rótulo curto de um conjunto de alimentos: "Arroz + Frango +2". */
export function quickLabel(items: Pick<QuickItem, 'name'>[]) {
  const names = items.slice(0, 2).map((i) => i.name);
  const more = items.length - names.length;
  return names.join(' + ') + (more > 0 ? ` +${more}` : '');
}

/** Repetir uma refeição, registrar uma favorita e salvar como favorita, com toast e "Desfazer". */
export function useQuickMeals() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const revalidate = useRevalidateDay();

  /** Desfazer = apagar a refeição que acabou de ser criada. */
  const undoCreate = useCallback(
    async (mealId: string, date: string) => {
      try {
        await api(`/meals/${mealId}`, { method: 'DELETE' });
        tap();
        await revalidate(date);
        toast.show({ message: 'Desfeito', durationMs: 2000 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        void revalidate(date);
      }
    },
    [revalidate, toast],
  );

  const announce = useCallback(
    async (meal: Meal, message: string) => {
      tap();
      await revalidate(meal.date);
      toast.show({ message, action: { label: 'Desfazer', onClick: () => void undoCreate(meal.id, meal.date) } });
    },
    [revalidate, toast, undoCreate],
  );

  const repeat = useCallback(
    async (mealId: string, date: string, type?: MealType) => {
      try {
        const meal = await api<Meal>(`/meals/${mealId}/repeat`, { method: 'POST', json: { date, ...(type ? { type } : {}) } });
        await announce(meal, `Registrado em ${MEAL_LABEL[meal.type]}`);
        return meal;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [announce, toast],
  );

  const logFavorite = useCallback(
    async (favoriteId: string, date: string, type: MealType) => {
      try {
        const meal = await api<Meal>(`/favorites/${favoriteId}/log`, { method: 'POST', json: { date, type } });
        void mutate('/favorites'); // a ordem (últimas usadas) mudou
        await announce(meal, `Registrado em ${MEAL_LABEL[meal.type]}`);
        return meal;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [announce, mutate, toast],
  );

  const saveFavorite = useCallback(
    async (mealId: string) => {
      try {
        const fav = await api<{ alreadyExists: boolean }>('/favorites', { method: 'POST', json: { fromMealId: mealId } });
        tap();
        void mutate('/favorites');
        toast.show({ message: fav.alreadyExists ? 'Essa refeição já está nas favoritas' : 'Salva nas favoritas', durationMs: 2500 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
    },
    [mutate, toast],
  );

  return { repeat, logFavorite, saveFavorite, announce };
}

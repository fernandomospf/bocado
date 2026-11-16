'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { tap } from './haptics';
import { MEAL_LABEL } from './labels';
import { useQuickMeals } from './quickMeals';
import type { Meal, MealType, SharedMealResult, SharedOffer } from './types';
import { useRevalidateDay } from './useRevalidateDay';

/** Divisão escolhida: percentuais inteiros por pessoa (somam 100). */
export type SplitShares = Record<string, number>;

export interface SharedMealInput {
  date: string;
  type: MealType;
  source?: string;
  note?: string;
  items: unknown[];
  shares: SplitShares;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Frase do toast depois de dividir: "Jantar salvo e enviado para Ana" (ou "adicionado" se aceitou automático). */
export function sharedToast(type: MealType, delivered: SharedMealResult['delivered']) {
  const label = MEAL_LABEL[type];
  const names = (list: typeof delivered) => list.map((d) => firstName(d.name)).join(', ');
  const offered = delivered.filter((d) => d.status === 'offered');
  const added = delivered.filter((d) => d.status === 'added');
  if (offered.length && added.length) return `${label} salvo, enviado para ${names(offered)} e adicionado para ${names(added)}`;
  if (offered.length) return `${label} salvo e enviado para ${names(offered)}`;
  return `${label} salvo e adicionado para ${names(added)}`;
}

/** Salva uma refeição dividida com a casa (POST /meals/shared) e mostra o toast. */
export function useSharedSave() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const revalidate = useRevalidateDay();

  return useCallback(
    async (input: SharedMealInput): Promise<Meal> => {
      const { shares, ...rest } = input;
      const res = await api<SharedMealResult>('/meals/shared', {
        method: 'POST',
        json: { ...rest, participants: Object.entries(shares).map(([userId, pct]) => ({ userId, share: pct / 100 })) },
      });
      tap();
      await revalidate(input.date);
      void mutate('/recipes');
      toast.show({ message: sharedToast(input.type, res.delivered), durationMs: 5000 });
      return res.meal;
    },
    [mutate, revalidate, toast],
  );
}

/** Aceitar e ignorar ofertas recebidas. */
export function useOfferActions() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const quick = useQuickMeals();

  const refresh = useCallback(() => mutate('/shared-meals/offers'), [mutate]);

  const accept = useCallback(
    async (offer: SharedOffer, always = false) => {
      try {
        const meal = await api<Meal>(`/shared-meals/offers/${offer.id}/accept`, {
          method: 'POST',
          json: always ? { always: true } : {},
        });
        await refresh();
        if (always) void mutate('/household');
        await quick.announce(
          meal,
          `${MEAL_LABEL[meal.type]} de ${firstName(offer.from.name)} adicionado${always ? '. Vou aceitar sempre' : ''}`,
        );
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        void refresh();
      }
    },
    [mutate, quick, refresh, toast],
  );

  const dismiss = useCallback(
    async (offer: SharedOffer) => {
      try {
        await api(`/shared-meals/offers/${offer.id}`, { method: 'DELETE' });
        tap();
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
      void refresh();
    },
    [refresh, toast],
  );

  return { accept, dismiss };
}

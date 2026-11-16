'use client';

import useSWR from 'swr';
import { todayISO } from './date';
import type { AdaptiveStatus, Household, SharedOffer, WeightSummary, Workout, DaySummary, Favorite, MealType, Me, Profile, RecentMeal, WeekStart } from './types';

export function useMe() {
  return useSWR<Me>('/auth/me');
}

export function useProfile() {
  return useSWR<Profile>('/profile');
}

/** Início da semana do usuário; segunda enquanto o perfil carrega (o padrão do servidor). */
export function useWeekStartsOn(): WeekStart {
  return useProfile().data?.weekStartsOn ?? 'MONDAY';
}

export function useDay(date: string) {
  return useSWR<DaySummary>(`/days/${date}`);
}

export function useFavorites() {
  return useSWR<Favorite[]>('/favorites');
}

/** Refeições recentes distintas; as do tipo informado vêm primeiro. */
export function useRecentMeals(type?: MealType) {
  return useSWR<RecentMeal[]>(`/meals/recent?limit=8${type ? `&type=${type}` : ''}`, { revalidateOnFocus: false });
}

/** Status da meta adaptativa (calculado no servidor com o dia local de hoje). */
export function useAdaptiveStatus(enabled = true) {
  return useSWR<AdaptiveStatus>(enabled ? `/adaptive/status?today=${todayISO()}` : null, { revalidateOnFocus: false });
}

/** O último treino do usuário (para "repetir o último" e pré-selecionar o registro). */
export function useLastWorkout() {
  return useSWR<Workout | null>('/workouts/last', { revalidateOnFocus: false });
}

/** Último peso e tendência (para pré-preencher o "Registrar peso"). */
export function useWeightSummary(enabled = true) {
  return useSWR<WeightSummary>(enabled ? '/weight/summary' : null, { revalidateOnFocus: false });
}

/** A casa do usuário (null se não estiver em nenhuma). */
export function useHousehold() {
  return useSWR<Household | null>('/household');
}

/** Refeições que alguém da casa dividiu com você e esperam resposta. */
export function useSharedOffers() {
  return useSWR<SharedOffer[]>('/shared-meals/offers');
}

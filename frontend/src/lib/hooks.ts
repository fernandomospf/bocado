'use client';

import useSWR from 'swr';
import { todayISO } from './date';
import type { AdaptiveStatus, DaySummary, Favorite, MealType, Me, Profile, RecentMeal, WeekStart } from './types';

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

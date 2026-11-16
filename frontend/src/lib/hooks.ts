'use client';

import useSWR from 'swr';
import type { DaySummary, Favorite, MealType, Me, Profile, RecentMeal, WeekStart } from './types';

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

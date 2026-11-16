'use client';

import useSWR from 'swr';
import { todayISO } from './date';
import type { AiQuota } from './aiQuota';
import type { WaterDay, WaterRangeDay } from './types';
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

/** Cotas de IA do próprio usuário (usado, limite e quando voltam). Revalide com mutate('/ai/quota') depois de cada chamada de IA. */
export function useAiQuota() {
  return useSWR<AiQuota>('/ai/quota', { revalidateOnFocus: true });
}

/** O dia de água: meta que valia, total e registros. `enabled` false pausa a busca (contador desligado). */
export function useWaterDay(date: string, enabled = true) {
  return useSWR<WaterDay>(enabled ? `/water?date=${date}` : null, { revalidateOnFocus: true });
}

export function useWaterRange(from: string, to: string, enabled = true) {
  return useSWR<{ days: WaterRangeDay[] }>(enabled ? `/water/range?from=${from}&to=${to}` : null);
}

export function useWaterStreak(today: string, enabled = true) {
  return useSWR<{ current: number; best: number }>(enabled ? `/water/streak?today=${today}` : null);
}

'use client';

import useSWR from 'swr';
import type { DaySummary, Me, Profile, WeekStart } from './types';

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

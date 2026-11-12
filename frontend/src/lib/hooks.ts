'use client';

import useSWR from 'swr';
import type { DaySummary, Me, Profile } from './types';

export function useMe() {
  return useSWR<Me>('/auth/me');
}

export function useProfile() {
  return useSWR<Profile>('/profile');
}

export function useDay(date: string) {
  return useSWR<DaySummary>(`/days/${date}`);
}

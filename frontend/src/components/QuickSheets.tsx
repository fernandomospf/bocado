'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { isValidISO, todayISO } from '@/lib/date';
import { useWeightSummary } from '@/lib/hooks';
import type { DayWorkout } from '@/lib/types';
import { isWeightKey } from './WeightSection';
import { WeightSheet } from './WeightSheet';
import { WorkoutSheet } from './WorkoutSheet';

interface QuickSheetsApi {
  /** Abre "Registrar treino" (ou a edição, com `workout`). Sem `date`, usa o dia mostrado na Hoje, ou hoje. */
  openWorkout: (opts?: { date?: string; workout?: DayWorkout }) => void;
  openWeight: () => void;
  /** Dia padrão para registros rápidos: o da Hoje se a pessoa está nela; nas outras telas, hoje. */
  defaultDate: () => string;
}

const QuickSheetsContext = createContext<QuickSheetsApi | null>(null);

export function useQuickSheets(): QuickSheetsApi {
  const ctx = useContext(QuickSheetsContext);
  if (!ctx) throw new Error('useQuickSheets precisa estar dentro de <WorkoutSheetProvider>');
  return ctx;
}

/** Lido na hora (não por hook) para não exigir Suspense em toda a área logada. */
function currentScreenDate() {
  const today = todayISO();
  if (typeof window === 'undefined' || window.location.pathname !== '/') return today;
  const param = new URLSearchParams(window.location.search).get('date');
  return isValidISO(param) && param <= today ? param : today;
}

/**
 * Monta as folhas "Registrar treino" e "Registrar peso" no nível do AppShell, para abrirem de qualquer rota
 * (menu do "+", Sidebar e atalhos de teclado).
 */
export function WorkoutSheetProvider({ children }: { children: ReactNode }) {
  const { mutate } = useSWRConfig();
  const [workout, setWorkout] = useState<{ date: string; workout: DayWorkout | null } | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useWeightSummary(weightOpen);

  const openWorkout = useCallback((opts?: { date?: string; workout?: DayWorkout }) => {
    setWorkout({ date: opts?.date ?? currentScreenDate(), workout: opts?.workout ?? null });
  }, []);
  const openWeight = useCallback(() => setWeightOpen(true), []);

  const api = useMemo(() => ({ openWorkout, openWeight, defaultDate: currentScreenDate }), [openWorkout, openWeight]);

  return (
    <QuickSheetsContext.Provider value={api}>
      {children}
      {workout && (
        <WorkoutSheet key={workout.workout?.id ?? 'new'} date={workout.date} workout={workout.workout} onClose={() => setWorkout(null)} />
      )}
      {weightOpen && !summaryLoading && (
        <WeightSheet
          defaultWeight={summary?.latest?.weightKg}
          onClose={() => setWeightOpen(false)}
          onSaved={async () => {
            await mutate(isWeightKey);
            setWeightOpen(false);
          }}
        />
      )}
    </QuickSheetsContext.Provider>
  );
}

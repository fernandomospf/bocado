'use client';

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { isValidISO, todayISO } from '@/lib/date';
import { useWeightSummary } from '@/lib/hooks';
import type { DayWorkout } from '@/lib/types';
import { isWeightKey } from './WeightSection';
import { MovementSheet } from './MovementSheet';
import { WaterSheet } from './WaterSheet';
import { WeightSheet } from './WeightSheet';
import { SupplementsQuickSheet } from './SupplementsSection';
import { FastingSheet } from './Fasting';
import { WorkoutSheet } from './WorkoutSheet';

interface QuickSheetsApi {
  /** Abre "Registrar treino" (ou a edição, com `workout`). Sem `date`, usa o dia mostrado na Hoje, ou hoje. */
  openWorkout: (opts?: { date?: string; workout?: DayWorkout }) => void;
  openWeight: () => void;
  /** Abre a folha "Água" (do dia da Hoje, ou de hoje; ou de `date`). */
  openWater: (date?: string) => void;
  /** Abre a folha "Movimento da semana" (da semana do dia mostrado, ou do dia dado). */
  openMovement: (date?: string) => void;
  /** Abre a folha "Suplementos e medicações" (itens de hoje). */
  openSupplements: () => void;
  /** Abre a folha de jejum (iniciar uma janela ou ver/encerrar a ativa). */
  openFasting: () => void;
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
  const [waterDate, setWaterDate] = useState<string | null>(null);
  const [movementDate, setMovementDate] = useState<string | null>(null);
  const [supplementsOpen, setSupplementsOpen] = useState(false);
  const [fastingOpen, setFastingOpen] = useState(false);
  const { data: summary, isLoading: summaryLoading } = useWeightSummary(weightOpen);

  const openWorkout = useCallback((opts?: { date?: string; workout?: DayWorkout }) => {
    setWorkout({ date: opts?.date ?? currentScreenDate(), workout: opts?.workout ?? null });
  }, []);
  const openWeight = useCallback(() => setWeightOpen(true), []);
  const openWater = useCallback((date?: string) => setWaterDate(date ?? currentScreenDate()), []);

  const openMovement = useCallback((date?: string) => setMovementDate(date ?? currentScreenDate()), []);
  const openSupplements = useCallback(() => setSupplementsOpen(true), []);
  const openFasting = useCallback(() => setFastingOpen(true), []);

  const api = useMemo(
    () => ({ openWorkout, openWeight, openWater, openMovement, openSupplements, openFasting, defaultDate: currentScreenDate }),
    [openWorkout, openWeight, openWater, openMovement, openSupplements, openFasting],
  );

  return (
    <QuickSheetsContext.Provider value={api}>
      {children}
      {workout && (
        <WorkoutSheet key={workout.workout?.id ?? 'new'} date={workout.date} workout={workout.workout} onClose={() => setWorkout(null)} />
      )}
      {waterDate && <WaterSheet key={waterDate} date={waterDate} onClose={() => setWaterDate(null)} />}
      {movementDate && <MovementSheet key={movementDate} date={movementDate} onClose={() => setMovementDate(null)} />}
      {supplementsOpen && <SupplementsQuickSheet onClose={() => setSupplementsOpen(false)} />}
      {fastingOpen && <FastingSheet onClose={() => setFastingOpen(false)} />}
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

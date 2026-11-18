'use client';

import { useCallback, useMemo } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { todayISO } from './date';
import { success, tap } from './haptics';
import { useProfile } from './hooks';
import { activePlans, genericNames, verbFor } from './supplements';
import type { InjectionSite, IntakeLog, SupplementDay, SupplementItem, SupplementPlan, WeightMarker } from './types';

/** O módulo está ativo para esta pessoa (ligado nas preferências e maior de 18 anos). Antes do perfil chegar: não. */
export function useSupplementsEnabled(): boolean {
  const { data: profile } = useProfile();
  return !!profile && profile.supplementsEnabled && profile.age >= 18;
}

/** Revalida tudo do módulo (dia, planos, histórico, marcadores do gráfico). */
export const isSupplementKey = (key: unknown) => typeof key === 'string' && key.startsWith('/supplements');

/** Planos (ativos e arquivados). Sem o módulo ativo a rota responde 403, então nem é consultada. */
export function useSupplementPlans() {
  const enabled = useSupplementsEnabled();
  return useSWR<{ plans: SupplementPlan[] }>(enabled ? `/supplements/plans?today=${todayISO()}` : null, { revalidateOnFocus: true });
}

export function useSupplementDay(date: string, enabled: boolean) {
  return useSWR<SupplementDay>(enabled ? `/supplements/day?date=${date}` : null, { revalidateOnFocus: true });
}

export function useSupplementHistory(planId: string | null, from: string, to: string) {
  return useSWR<{ logs: IntakeLog[] }>(planId ? `/supplements/history?planId=${planId}&from=${from}&to=${to}` : null);
}

export function useWeightMarkers(from: string, to: string, enabled: boolean) {
  return useSWR<WeightMarker[]>(enabled ? `/supplements/weight-markers?from=${from}&to=${to}` : null);
}

/** Há ao menos um item ativo? (Define se o "+", a Sidebar e a Hoje mostram o módulo.) */
export function useHasActiveSupplements() {
  const enabled = useSupplementsEnabled();
  const { data } = useSupplementPlans();
  return enabled && activePlans(data?.plans).length > 0;
}

/** Nomes da Hoje: o real, ou "Medicação 1" / "Suplemento 2" com "Mostrar nomes na tela Hoje" desligado. */
export function useSupplementNames() {
  const { data: profile } = useProfile();
  const { data } = useSupplementPlans();
  const masked = !!profile?.supplementsMaskNamesOnHome;
  const generic = useMemo(() => genericNames(data?.plans ?? []), [data]);
  const name = useCallback((plan: { id: string; name: string }) => (masked ? (generic.get(plan.id) ?? 'Suplemento') : plan.name), [masked, generic]);
  return { masked, name };
}

export interface RegisterOptions {
  site?: InjectionSite | null;
  doseAmount?: number;
  /** Instante ISO em que foi tomada (padrão: agora). */
  takenAt?: string;
  /** Dia previsto; padrão: o dia original do item. */
  date?: string;
}

/**
 * Registrar, pular e desfazer. Um toque registra na hora (haptics de sucesso), com "Desfazer" no aviso.
 * Nada daqui vai para analytics ou log: só chamadas à API da própria pessoa.
 */
export function useSupplementActions() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const refresh = useCallback(() => mutate(isSupplementKey), [mutate]);

  const undo = useCallback(
    async (logId: string, message: string) => {
      try {
        await api(`/supplements/log/${logId}`, { method: 'DELETE' });
        tap();
        await refresh();
        toast.show({ message, durationMs: 2000 });
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
    },
    [refresh, toast],
  );

  const register = useCallback(
    async (item: Pick<SupplementItem, 'planId' | 'slot' | 'dueDate' | 'administration'>, opts: RegisterOptions = {}) => {
      try {
        const body: Record<string, unknown> = { planId: item.planId, date: opts.date ?? item.dueDate, slot: item.slot };
        if (opts.site) body.site = opts.site;
        if (opts.doseAmount !== undefined) body.doseAmount = opts.doseAmount;
        if (opts.takenAt) body.takenAt = opts.takenAt;
        const log = await api<IntakeLog>('/supplements/log', { method: 'POST', json: body });
        success();
        await refresh();
        toast.show({ message: 'Registrado', action: { label: 'Desfazer', onClick: () => void undo(log.id, 'Registro desfeito') } });
        return log;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [refresh, toast, undo],
  );

  const skip = useCallback(
    async (item: Pick<SupplementItem, 'planId' | 'slot' | 'dueDate'>) => {
      try {
        const log = await api<IntakeLog>('/supplements/log/skip', { method: 'POST', json: { planId: item.planId, date: item.dueDate, slot: item.slot } });
        tap();
        await refresh();
        toast.show({ message: 'Pulado desta vez', action: { label: 'Desfazer', onClick: () => void undo(log.id, 'Desfeito') } });
        return log;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [refresh, toast, undo],
  );

  const removeLog = useCallback(
    async (logId: string) => {
      try {
        await api(`/supplements/log/${logId}`, { method: 'DELETE' });
        tap();
        await refresh();
        toast.show({ message: 'Registro removido', durationMs: 2500 });
        return true;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return false;
      }
    },
    [refresh, toast],
  );

  return { register, skip, removeLog, refresh, verbFor };
}

'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useToast } from '@/components/Toast';
import { api, errorMessage } from './api';
import { success, tap } from './haptics';
import { LAST_ML_KEY, fmtMl, goalToastKey } from './water';

/** Revalida tudo que mostra água: o dia, a semana e a sequência. */
const isWaterKey = (key: unknown) => typeof key === 'string' && key.startsWith('/water');

/**
 * Registrar e apagar água, com toast e "Desfazer". Ao bater a meta pela primeira vez no dia: um toast e uma vibração
 * de sucesso (uma vez por dia, controlado no localStorage). Nunca incentiva passar de 100%.
 */
export function useWaterActions(date: string) {
  const toast = useToast();
  const { mutate } = useSWRConfig();

  const remove = useCallback(
    async (id: string) => {
      try {
        await api(`/water/${id}`, { method: 'DELETE' });
        tap();
        await mutate(isWaterKey);
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
    },
    [mutate, toast],
  );

  const add = useCallback(
    async (amountMl: number, opts: { undo?: boolean } = {}) => {
      try {
        const res = await api<{ entry: { id: string }; totalMl: number; goalMl: number | null }>('/water', {
          method: 'POST',
          json: { date, amountMl },
        });
        tap();
        try {
          localStorage.setItem(LAST_ML_KEY, String(amountMl));
        } catch {
          /* sem armazenamento: o atalho volta a 200 ml */
        }
        await mutate(isWaterKey);

        const hit = res.goalMl !== null && res.totalMl >= res.goalMl && res.totalMl - amountMl < res.goalMl;
        let firstHit = false;
        if (hit) {
          try {
            firstHit = localStorage.getItem(goalToastKey(date)) === null;
            if (firstHit) localStorage.setItem(goalToastKey(date), '1');
          } catch {
            firstHit = true;
          }
        }
        if (firstHit) {
          success();
          toast.show({ message: 'Meta de água de hoje batida', durationMs: 4000 });
        } else if (opts.undo) {
          toast.show({
            message: `${fmtMl(amountMl)} ml de água registrados`,
            durationMs: 4000,
            action: { label: 'Desfazer', onClick: () => void remove(res.entry.id) },
          });
        }
        return res;
      } catch (err) {
        toast.show({ message: errorMessage(err), tone: 'error' });
        return null;
      }
    },
    [date, mutate, remove, toast],
  );

  return { add, remove };
}


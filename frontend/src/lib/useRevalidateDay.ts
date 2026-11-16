'use client';

import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

/** O dia, a faixa da semana/histórico, o "Para fechar o dia" e os recentes dependem das refeições. */
export function useRevalidateDay() {
  const { mutate } = useSWRConfig();
  return useCallback(
    (date: string) =>
      mutate(
        (key) =>
          typeof key === 'string' &&
          (key === `/days/${date}` ||
            key.startsWith('/days?') ||
            key.startsWith('/suggestions/close-day') ||
            key.startsWith('/meals/recent')),
      ),
    [mutate],
  );
}

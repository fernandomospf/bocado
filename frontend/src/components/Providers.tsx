'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { ApiError, fetcher } from '@/lib/api';
import { ToastProvider } from './Toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,
        keepPreviousData: true,
        // 4xx não melhora repetindo
        shouldRetryOnError: (err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500),
      }}
    >
      {/* Acima das rotas: o toast sobrevive à navegação (ex.: salvar e voltar para Hoje) */}
      <ToastProvider>{children}</ToastProvider>
    </SWRConfig>
  );
}

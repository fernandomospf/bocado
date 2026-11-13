'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useShortcuts } from '@/lib/useShortcuts';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';

/**
 * Moldura da área logada. Renderiza sempre a Sidebar e a TabBar; o CSS decide qual aparece
 * (TabBar abaixo de 1100px, Sidebar a partir daí). Nada de detectar tela em JS: evita flash no SSR.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  useShortcuts({ n: () => router.push('/add') });

  return (
    <>
      <Sidebar />
      <div className="app-content">{children}</div>
      <TabBar />
    </>
  );
}

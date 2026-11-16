'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useShortcuts } from '@/lib/useShortcuts';
import { WorkoutSheetProvider, useQuickSheets } from './QuickSheets';
import { Sidebar } from './Sidebar';
import { TabBar } from './TabBar';
import { TopBar } from './TopBar';

/**
 * Moldura da área logada. Renderiza sempre a Sidebar e a TabBar; o CSS decide qual aparece
 * (TabBar abaixo de 1100px, Sidebar a partir daí). Nada de detectar tela em JS: evita flash no SSR.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <WorkoutSheetProvider>
      <Shell>{children}</Shell>
    </WorkoutSheetProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { openWorkout } = useQuickSheets();
  // Só com mouse/trackpad, fora de campos e sem folha aberta (o próprio hook cuida disso)
  useShortcuts({ n: () => router.push('/add'), t: () => openWorkout() });

  return (
    <>
      <TopBar />
      <Sidebar />
      <div className="app-content">{children}</div>
      <TabBar />
    </>
  );
}

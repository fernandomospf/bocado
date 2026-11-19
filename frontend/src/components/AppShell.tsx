'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { useA11yPrefs } from '@/lib/a11y';
import { useProfile } from '@/lib/hooks';
import { takePendingInvite } from '@/lib/invite';
import type { Household } from '@/lib/types';
import { useToast } from './Toast';
import { useShortcuts } from '@/lib/useShortcuts';
import { WorkoutSheetProvider, useQuickSheets } from './QuickSheets';
import { KEYBOARD_HELP_EVENT, KeyboardHelp } from './KeyboardHelp';
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
  const { openWorkout, openWater } = useQuickSheets();
  const { data: profile } = useProfile();
  // Só com mouse/trackpad, fora de campos e sem folha aberta (o próprio hook cuida disso)
  useShortcuts({
    n: () => router.push('/add'),
    t: () => openWorkout(),
    // W abre a água (só se o contador estiver ligado)
    w: () => profile?.waterEnabled !== false && openWater(),
    '?': () => window.dispatchEvent(new Event(KEYBOARD_HELP_EVENT)),
  });
  usePendingInvite();
  useA11yPrefs();

  return (
    <>
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <TopBar />
      <Sidebar />
      <div className="app-content" id="conteudo" tabIndex={-1}>
        {children}
      </div>
      <TabBar />
      <KeyboardHelp />
    </>
  );
}

/**
 * Convite guardado antes do login (rota /convite/[code]): depois de entrar e concluir o questionário, o app
 * está montado aqui e conclui a entrada na casa. A chave é apagada ao ler, com sucesso ou erro.
 */
function usePendingInvite() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const code = takePendingInvite();
    if (!code) return;
    api<Household>('/household/join', { method: 'POST', json: { code } })
      .then((house) => {
        toast.show({ message: `Você entrou na casa ${house.name}`, durationMs: 4000 });
        void mutate((key) => typeof key === 'string' && (key.startsWith('/household') || key.startsWith('/recipes')));
      })
      .catch((err) => toast.show({ message: `Não foi possível entrar na casa: ${errorMessage(err)}`, tone: 'error', durationMs: 7000 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

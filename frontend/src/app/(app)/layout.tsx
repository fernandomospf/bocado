'use client';

import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';
import { AppShell } from '@/components/AppShell';
import { ApiError } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { storeReturnPath, takeReturnPath } from '@/lib/quickActions';

/** Área logada: exige sessão e questionário concluído. */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: me, error } = useMe();

  const pathname = usePathname();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      // Atalho aberto sem sessão: depois do login, volta para ele (só caminhos internos /rapido/, validados)
      storeReturnPath(`${pathname}${window.location.search}`, window.localStorage);
      router.replace('/login');
    } else if (me && !me.onboarded) router.replace('/onboarding');
    else if (me?.onboarded && pathname === '/') {
      const back = takeReturnPath(window.localStorage);
      if (back) router.replace(back);
    }
  }, [me, error, router, pathname]);

  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <main className="screen screen-plain screen-center">
        <div className="card glass stack" style={{ textAlign: 'center' }}>
          <p className="headline">Não foi possível carregar</p>
          <p className="body-2">{error.message}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      </main>
    );
  }

  if (!me || !me.onboarded) {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" aria-label="Carregando" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}

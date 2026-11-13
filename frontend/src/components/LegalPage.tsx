import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

/** Layout de leitura das páginas públicas (privacidade, termos). Server Component, sem guard de login. */
export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <main className="screen screen-plain">
      <header className="brand" style={{ paddingTop: 12 }}>
        <Logo size={56} />
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="large-title">{title}</h1>
          <p className="caption">Última atualização: {updatedAt}</p>
        </div>
      </header>

      <article className="card glass legal">{children}</article>

      <Link href="/" className="btn btn-plain" style={{ alignSelf: 'center' }}>
        Voltar ao Bocado
      </Link>
    </main>
  );
}

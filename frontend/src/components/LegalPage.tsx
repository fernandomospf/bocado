import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from './Logo';

export interface LegalToc {
  id: string;
  label: string;
}

/** Layout de leitura das páginas públicas (privacidade, termos). Server Component, sem guard de login. */
export function LegalPage({
  title,
  updatedAt,
  toc,
  otherPage,
  children,
}: {
  title: string;
  updatedAt: string;
  /** Índice com âncoras no topo (opcional). Cada id precisa existir como id de um h2 no conteúdo. */
  toc?: LegalToc[];
  /** Link cruzado para a outra página legal, no fim. */
  otherPage: { href: string; label: string };
  children: ReactNode;
}) {
  return (
    <main className="screen screen-plain">
      <header className="brand" style={{ paddingTop: 12 }}>
        <Logo size={56} />
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="large-title">{title}</h1>
          <p className="caption">Última atualização: {updatedAt}</p>
        </div>
      </header>

      <article className="card glass legal">
        {toc && (
          <nav className="legal-toc" aria-label="Índice">
            <ol>
              {toc.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.label}</a>
                </li>
              ))}
            </ol>
          </nav>
        )}
        {children}
      </article>

      <nav className="caption legal-links" aria-label="Outras páginas">
        <Link href={otherPage.href}>{otherPage.label}</Link>
        <Link href="/">Voltar ao Bocado</Link>
      </nav>
    </main>
  );
}

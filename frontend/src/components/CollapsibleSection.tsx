'use client';

import { type ReactNode, useId } from 'react';
import { ChevronRight } from './Icons';

interface CollapsibleSectionProps {
  title: ReactNode;
  /** Algo discreto ao lado do título (ex.: o ponto "Sugestão" com o painel fechado). */
  badge?: ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
  className?: string;
}

/**
 * Seção com cabeçalho que abre e fecha. O cabeçalho é um <button> (Enter e Espaço nativos) com aria-expanded e
 * aria-controls; o painel é role="region". O conteúdo fica montado quando fechado (inert e fora da leitura), para
 * a altura animar e para cards internos continuarem sabendo se têm algo a mostrar.
 * A animação é da altura (grid 0fr → 1fr) e some com prefers-reduced-motion.
 */
export function CollapsibleSection({ title, badge, open, onToggle, children, className }: CollapsibleSectionProps) {
  const id = useId();
  const headId = `${id}-head`;
  const panelId = `${id}-panel`;

  return (
    <section className={`collapsible${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}>
      <h2 className="collapsible-heading">
        <button
          type="button"
          id={headId}
          className="collapsible-head"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(!open)}
        >
          <span className="collapsible-title">{title}</span>
          {badge}
          <ChevronRight className="collapsible-chevron" width={18} height={18} />
        </button>
      </h2>
      <div id={panelId} role="region" aria-labelledby={headId} className="collapsible-panel" inert={!open} aria-hidden={!open}>
        <div className="collapsible-inner">{children}</div>
      </div>
    </section>
  );
}

'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** Folha inferior modal, com foco preso e fechamento por Esc ou toque fora. */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="sheet-root">
      <button type="button" className="sheet-scrim" aria-label="Fechar" onClick={onClose} />
      <div
        ref={panel}
        className="sheet glass"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet-grabber" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}

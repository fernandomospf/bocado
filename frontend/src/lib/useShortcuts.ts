'use client';

import { useEffect, useRef } from 'react';

type Handlers = Partial<Record<string, () => void>>;

/** Foco num campo de texto, ou um diálogo aberto: atalhos de uma tecla não devem disparar. */
function shouldIgnore(e: KeyboardEvent) {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true;
  const el = e.target as HTMLElement | null;
  if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return true;
  return document.querySelector('[aria-modal="true"]') !== null;
}

/**
 * Atalhos de teclado só para quem usa mouse/trackpad (pointer fine); no toque não fazem sentido.
 * As teclas são comparadas por `KeyboardEvent.key` ("n", "ArrowLeft"...), sem diferenciar maiúsculas.
 */
export function useShortcuts(handlers: Handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const onKey = (e: KeyboardEvent) => {
      if (!fine.matches || shouldIgnore(e)) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const handler = ref.current[key];
      if (handler) {
        e.preventDefault();
        handler();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

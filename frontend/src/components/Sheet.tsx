'use client';

import { type PointerEvent, type ReactNode, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Distância (px) do arraste para baixo, no topo da folha, que fecha. */
const DRAG_CLOSE = 80;

/** Mantém o Tab dentro do painel: do último elemento volta ao primeiro (e vice-versa com Shift). */
function trapTab(e: KeyboardEvent, root: HTMLElement) {
  const items = [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (items.length === 0) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !root.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

/** Folhas abertas ao mesmo tempo: o scroll do body só volta quando a última fecha, e o Esc fecha só a de cima. */
const stack: HTMLElement[] = [];

/**
 * Folha modal (portal no body), com foco preso. Fecha pelo X, por Esc, tocando fora ou arrastando o topo para baixo
 * (celular). Ao fechar, libera o scroll do body e devolve o foco a quem abriu.
 * No celular sobe de baixo; a partir de 768px o CSS a transforma num diálogo centralizado.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const panel = useRef<HTMLDivElement>(null);
  // onClose costuma ser uma função nova a cada render do pai: guardada em ref, o efeito abaixo roda só ao abrir/fechar.
  // (Antes, cada render reiniciava o efeito: o foco pulava para fora do campo em que a pessoa digitava.)
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const drag = useRef<{ y: number; dy: number; id: number } | null>(null);

  useEffect(() => {
    const el = panel.current;
    if (!open || !el) return;
    const previous = document.activeElement as HTMLElement | null;
    if (stack.length === 0) document.body.style.overflow = 'hidden';
    stack.push(el);
    el.focus();

    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== el) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === 'Tab') trapTab(e, el);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(el), 1);
      if (stack.length === 0) document.body.style.overflow = '';
      // Devolve o foco a quem abriu, se ele ainda estiver na página
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);

  // Arrastar o topo da folha para baixo (toque ou caneta): acompanha o dedo e fecha a partir de 80px
  function onDragStart(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' || (e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, dy: 0, id: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // segue o dedo mesmo se ele sair do topo da folha
    } catch {
      // Ponteiro já encerrado: o arraste funciona sem a captura
    }
    panel.current?.setAttribute('data-dragging', '');
  }

  function onDragMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !panel.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    panel.current.style.transform = `translateY(${d.dy}px)`;
  }

  function onDragEnd(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const el = panel.current;
    el?.removeAttribute('data-dragging');
    if (d.dy >= DRAG_CLOSE) closeRef.current();
    else if (el) el.style.transform = '';
  }

  if (!open) return null;

  return createPortal(
    <div className="sheet-root">
      <button type="button" className="sheet-scrim" aria-label="Fechar" tabIndex={-1} onClick={() => closeRef.current()} />
      <div ref={panel} className="sheet glass" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div
          className="sheet-top"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        >
          <div className="sheet-grabber" aria-hidden />
          <button type="button" className="sheet-close" aria-label="Fechar" onClick={() => closeRef.current()}>
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

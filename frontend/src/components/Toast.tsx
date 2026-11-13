'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon } from './Icons';

export interface ToastOptions {
  message: string;
  action?: { label: string; onClick: () => void };
  /** Tempo na tela; pausa enquanto o mouse está em cima ou o foco está dentro. */
  durationMs?: number;
  tone?: 'default' | 'error';
}

interface ToastApi {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
}

interface ActiveToast extends Required<Pick<ToastOptions, 'message' | 'durationMs'>> {
  id: number;
  action?: ToastOptions['action'];
  tone: 'default' | 'error';
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}

/**
 * Um toast por vez (o novo substitui o anterior). Montado acima das rotas para sobreviver à navegação:
 * dá para mostrar "Almoço salvo" e trocar de tela em seguida.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ActiveToast | null>(null);
  const nextId = useRef(0);

  const show = useCallback((options: ToastOptions) => {
    nextId.current += 1;
    setToast({
      id: nextId.current,
      message: options.message,
      action: options.action,
      durationMs: options.durationMs ?? 5000,
      tone: options.tone ?? 'default',
    });
  }, []);

  const dismiss = useCallback(() => setToast(null), []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* A região viva fica sempre montada: leitores de tela só anunciam mudanças em regiões que já existiam */}
      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const remaining = useRef(toast.durationMs);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const pause = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    remaining.current -= Date.now() - startedAt.current;
  }, []);

  const resume = useCallback(() => {
    if (timer.current) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(onDismiss, Math.max(remaining.current, 800));
  }, [onDismiss]);

  useEffect(() => {
    resume();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [resume]);

  return (
    <div
      ref={root}
      className={toast.tone === 'error' ? 'toast glass toast-error' : 'toast glass'}
      onMouseEnter={pause}
      onMouseLeave={() => {
        if (!root.current?.contains(document.activeElement)) resume();
      }}
      onFocus={pause}
      onBlur={(e) => {
        // Só retoma quando o foco sai do toast inteiro (não ao ir da ação para o fechar)
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) resume();
      }}
    >
      <span className="toast-message">{toast.message}</span>
      {toast.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            toast.action?.onClick();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Fechar aviso">
        <CloseIcon width={18} height={18} />
      </button>
    </div>
  );
}

import { createElement, type ReactElement } from 'react';

/**
 * Núcleo do modo "esconder calorias": funções puras (sem dependências do app) para poderem ser testadas
 * e usadas tanto pelo hook quanto pelo script inline do <head>.
 */
export const HIDE_CALORIES_KEY = 'bocado:hideCalories';
export const HIDE_CALORIES_ATTR = 'data-hide-calories';

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

/** "540 kcal" ou, com o modo ligado, texto vazio (os componentes não precisam de if). */
export function fmtKcal(value: number, hide = false, unit = true): string {
  if (hide) return '';
  const n = int.format(Math.round(value));
  return unit ? `${n} kcal` : n;
}

/** O valor do servidor manda; antes de ele chegar, vale o espelho local (sem "flash"). */
export function resolveHide(server: boolean | undefined, stored: boolean): boolean {
  return server ?? stored;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function readStoredHide(storage: StorageLike | undefined): boolean {
  try {
    return storage?.getItem(HIDE_CALORIES_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeStoredHide(storage: StorageLike | undefined, hide: boolean) {
  try {
    if (hide) storage?.setItem(HIDE_CALORIES_KEY, '1');
    else storage?.removeItem(HIDE_CALORIES_KEY);
  } catch {
    /* sem armazenamento: só o valor do servidor vale */
  }
}

/** Atributo no <html>: o CSS de segurança esconde .kcal-only enquanto o modo estiver ligado. */
export function applyHideAttr(root: { setAttribute(n: string, v: string): void; removeAttribute(n: string): void } | undefined, hide: boolean) {
  if (!root) return;
  if (hide) root.setAttribute(HIDE_CALORIES_ATTR, '');
  else root.removeAttribute(HIDE_CALORIES_ATTR);
}

/** Roda no <head>, antes da hidratação. Curto de propósito. */
export const HIDE_CALORIES_INLINE_SCRIPT = `try{if(localStorage.getItem('${HIDE_CALORIES_KEY}')==='1')document.documentElement.setAttribute('${HIDE_CALORIES_ATTR}','')}catch(e){}`;

interface KcalViewProps {
  value: number;
  hidden: boolean;
  /** Mostra a unidade ("540 kcal"); sem ela, só o número. */
  unit?: boolean;
  className?: string;
}

/** Parte pura de <Kcal>: renderiza null com o modo ligado. */
export function KcalView({ value, hidden, unit = true, className }: KcalViewProps): ReactElement | null {
  if (hidden) return null;
  return createElement('span', { className: ['num', className].filter(Boolean).join(' ') }, fmtKcal(value, false, unit));
}

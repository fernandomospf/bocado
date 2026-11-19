'use client';

import { useEffect } from 'react';
import { useProfile } from './hooks';

/**
 * Acessibilidade: alto contraste, menos transparência e menos animação. Valem quando o SISTEMA pede (prefers-contrast,
 * prefers-reduced-transparency, prefers-reduced-motion) OU quando a pessoa liga nas preferências (salvas no perfil).
 * O espelho em localStorage + o script inline do <head> aplicam tudo antes da hidratação, sem flash.
 */

export const A11Y_KEY = 'bocado:a11y';

export interface A11yPrefs {
  highContrast: boolean;
  reduceTransparency: boolean;
  reduceMotion: boolean;
}

/** Roda no <head> (junto do script das calorias): lê o espelho e as preferências do sistema. Curto de propósito. */
export const A11Y_INLINE_SCRIPT = `try{var d=document.documentElement,s=JSON.parse(localStorage.getItem('${A11Y_KEY}')||'{}'),m=function(q){return window.matchMedia&&matchMedia(q).matches};var c=s.c||m('(prefers-contrast: more)');if(c)d.setAttribute('data-contrast','more');if(c||s.t||m('(prefers-reduced-transparency: reduce)'))d.setAttribute('data-reduce-transparency','');if(s.m||m('(prefers-reduced-motion: reduce)'))d.setAttribute('data-reduce-motion','')}catch(e){}`;

/** Espelho compacto para o script inline. */
export const toMirror = (p: A11yPrefs) => JSON.stringify({ c: p.highContrast, t: p.reduceTransparency, m: p.reduceMotion });

const QUERIES = {
  contrast: '(prefers-contrast: more)',
  transparency: '(prefers-reduced-transparency: reduce)',
  motion: '(prefers-reduced-motion: reduce)',
} as const;

/** Atributos finais no <html>: preferência da pessoa OU do sistema. Alto contraste também tira a transparência. */
export function applyA11y(root: HTMLElement, p: A11yPrefs, system: { contrast: boolean; transparency: boolean; motion: boolean }) {
  const contrast = p.highContrast || system.contrast;
  const set = (name: string, on: boolean, value = '') => (on ? root.setAttribute(name, value) : root.removeAttribute(name));
  set('data-contrast', contrast, 'more');
  set('data-reduce-transparency', contrast || p.reduceTransparency || system.transparency);
  set('data-reduce-motion', p.reduceMotion || system.motion);
}

/** Mantém os atributos do <html> e o espelho em dia com o perfil e com as preferências do sistema. */
export function useA11yPrefs() {
  const { data: profile } = useProfile();
  const high = profile?.a11yHighContrast;
  const transparency = profile?.a11yReduceTransparency;
  const motion = profile?.a11yReduceMotion;

  useEffect(() => {
    if (high === undefined || transparency === undefined || motion === undefined) return;
    const prefs: A11yPrefs = { highContrast: high, reduceTransparency: transparency, reduceMotion: motion };
    try {
      window.localStorage.setItem(A11Y_KEY, toMirror(prefs));
    } catch {
      // Sem armazenamento: vale só nesta sessão
    }
    const mq = Object.fromEntries(Object.entries(QUERIES).map(([k, q]) => [k, window.matchMedia(q)])) as Record<keyof typeof QUERIES, MediaQueryList>;
    const run = () => applyA11y(document.documentElement, prefs, { contrast: mq.contrast.matches, transparency: mq.transparency.matches, motion: mq.motion.matches });
    run();
    Object.values(mq).forEach((m) => m.addEventListener('change', run));
    return () => Object.values(mq).forEach((m) => m.removeEventListener('change', run));
  }, [high, transparency, motion]);
}

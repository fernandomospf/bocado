'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useProfile } from './hooks';
import { applyHideAttr, readStoredHide, resolveHide, writeStoredHide } from './kcal';

const EVENT = 'bocado:display-prefs';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * Preferências de exibição. Antes de o perfil chegar vale o espelho em localStorage (o mesmo que o script do <head>
 * usa para o atributo data-hide-calories); depois, o servidor manda e o espelho é atualizado.
 */
export function useDisplayPrefs() {
  const { data: profile } = useProfile();
  const stored = useSyncExternalStore(
    subscribe,
    () => readStoredHide(window.localStorage),
    () => false,
  );
  const hideCalories = resolveHide(profile?.hideCalories, stored);

  useEffect(() => {
    if (profile?.hideCalories === undefined) return;
    writeStoredHide(window.localStorage, profile.hideCalories);
    applyHideAttr(document.documentElement, profile.hideCalories);
    window.dispatchEvent(new Event(EVENT));
  }, [profile?.hideCalories]);

  return { hideCalories, hideWeight: profile?.hideWeightInReports ?? false };
}

/** Só o booleano, para quem não precisa do resto. */
export const useHideCalories = () => useDisplayPrefs().hideCalories;

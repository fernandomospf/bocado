'use client';

import { useCallback, useEffect, useState } from 'react';
import { type HomeSection, isSectionOpen, readSections, sectionsKey, type SectionState, writeSection } from './movement';

/**
 * Aberto/fechado dos dropdowns da Hoje, por usuário e no aparelho (localStorage "bocado:home:sections:<userId>").
 * O que a pessoa abriu ou fechou à mão vale sobre o padrão (Refeições aberto; Atividades aberto só com treino no dia).
 */
export function useHomeSections(userId: string | undefined, ctx: { hasWorkouts: boolean; hasPendingSupplements?: boolean }) {
  const [manual, setManual] = useState<SectionState>({});

  useEffect(() => {
    if (userId) setManual(readSections(window.localStorage, sectionsKey(userId)));
  }, [userId]);

  const toggle = useCallback(
    (section: HomeSection, open: boolean) => {
      setManual((m) => ({ ...m, [section]: open }));
      if (userId) writeSection(window.localStorage, sectionsKey(userId), section, open);
    },
    [userId],
  );

  return {
    mealsOpen: isSectionOpen('meals', manual, ctx),
    activitiesOpen: isSectionOpen('activities', manual, ctx),
    supplementsOpen: isSectionOpen('supplements', manual, ctx),
    toggle,
  };
}

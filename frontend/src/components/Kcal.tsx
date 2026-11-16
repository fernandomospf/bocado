'use client';

import { useHideCalories } from '@/lib/display-prefs';
import { KcalView } from '@/lib/kcal';

/** "540 kcal" que some com o modo "esconder calorias". Com `unit={false}`, só o número. */
export function Kcal({ value, unit, className }: { value: number; unit?: boolean; className?: string }) {
  return KcalView({ value, hidden: useHideCalories(), unit, className });
}

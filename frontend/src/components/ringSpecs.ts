import type { RingSpec } from './Rings';
import type { Macros } from '@/lib/types';

/** Cores resolvidas em JS para os gradientes SVG (claro/escuro compartilham os tons). */
export function ringSpecs(totals: Macros, targets: Macros): RingSpec[] {
  return [
    { key: 'kcal', label: 'Energia', value: totals.kcal, target: targets.kcal, from: '#ff4f4a', to: '#ff8a3d' },
    { key: 'protein', label: 'Proteína', value: totals.protein, target: targets.protein, from: '#3f6dff', to: '#7aa0ff' },
    { key: 'carbs', label: 'Carboidratos', value: totals.carbs, target: targets.carbs, from: '#f5a10f', to: '#ffd155' },
    { key: 'fat', label: 'Gorduras', value: totals.fat, target: targets.fat, from: '#12b8a6', to: '#5fe0cf' },
  ];
}

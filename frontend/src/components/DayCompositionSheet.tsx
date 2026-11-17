'use client';

import { dayTitle } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import type { Macros, Meal } from '@/lib/types';
import { Sheet } from './Sheet';

const ROWS = [
  { key: 'kcal', label: 'Energia', unit: 'kcal', color: 'var(--ring-kcal)' },
  { key: 'protein', label: 'Proteína', unit: 'g', color: 'var(--ring-protein)' },
  { key: 'carbs', label: 'Carboidratos', unit: 'g', color: 'var(--ring-carbs)' },
  { key: 'fat', label: 'Gorduras', unit: 'g', color: 'var(--ring-fat)' },
] as const;

/** "Como seu dia se compôs": cada macro frente à meta e quanto cada refeição trouxe. Meta é referência, não prova. */
export function DayCompositionSheet({
  date,
  totals,
  targets,
  meals,
  hideCalories,
  onClose,
}: {
  date: string;
  totals: Macros;
  targets: Macros;
  meals: Meal[];
  hideCalories: boolean;
  onClose: () => void;
}) {
  const rows = ROWS.filter((r) => !(hideCalories && r.key === 'kcal'));
  const perMeal = MEAL_ORDER.map((type) => {
    const list = meals.filter((m) => m.type === type);
    return {
      type,
      kcal: list.reduce((s, m) => s + m.totals.kcal, 0),
      protein: list.reduce((s, m) => s + m.totals.protein, 0),
      count: list.reduce((s, m) => s + m.items.length, 0),
    };
  }).filter((m) => m.count > 0);

  return (
    <Sheet open title="Como seu dia se compôs" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Como seu dia se compôs</h2>
          <p className="caption">{dayTitle(date)}</p>
        </div>

        <div className="legend" style={{ gridTemplateColumns: '1fr' }}>
          {rows.map((r) => {
            const diff = targets[r.key] - totals[r.key];
            return (
              <div key={r.key} className="legend-item">
                <span className="legend-label" style={{ color: r.color }}>
                  {r.label}
                </span>
                <span className="legend-value">
                  {fmtInt(totals[r.key])}
                  <small>
                    {' '}
                    / {fmtInt(targets[r.key])} {r.unit} ·{' '}
                    {diff >= 0 ? `faltam ${fmtInt(diff)} ${r.unit}` : `${fmtInt(-diff)} ${r.unit} além da meta`}
                  </small>
                </span>
              </div>
            );
          })}
        </div>

        <div className="stack-sm">
          <h3 className="headline">Por refeição</h3>
          {perMeal.length === 0 ? (
            <p className="caption">Nada registrado neste dia.</p>
          ) : (
            <div className="list">
              {perMeal.map((m) => (
                <div key={m.type} className="list-row">
                  <span className="list-row-main">
                    <span className="list-row-title">{MEAL_LABEL[m.type]}</span>
                  </span>
                  <span className="list-row-end num">{hideCalories ? `${fmtInt(m.protein)} g de proteína` : `${fmtInt(m.kcal)} kcal`}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

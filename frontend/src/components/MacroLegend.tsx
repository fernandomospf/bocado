import { fmtInt } from '@/lib/format';
import type { Macros } from '@/lib/types';

const ROWS = [
  { key: 'kcal', label: 'Energia', unit: 'kcal', color: 'var(--ring-kcal)' },
  { key: 'protein', label: 'Proteína', unit: 'g', color: 'var(--ring-protein)' },
  { key: 'carbs', label: 'Carboidratos', unit: 'g', color: 'var(--ring-carbs)' },
  { key: 'fat', label: 'Gorduras', unit: 'g', color: 'var(--ring-fat)' },
] as const;

export function MacroLegend({ totals, targets }: { totals: Macros; targets: Macros }) {
  return (
    <div className="legend">
      {ROWS.map((r) => (
        <div key={r.key} className="legend-item">
          <span className="legend-label" style={{ color: r.color }}>
            {r.label}
          </span>
          <span className="legend-value">
            {fmtInt(totals[r.key])}
            <small>
              {' '}
              / {fmtInt(targets[r.key])} {r.unit}
            </small>
          </span>
        </div>
      ))}
    </div>
  );
}

export function MacroDots({ m }: { m: Pick<Macros, 'protein' | 'carbs' | 'fat'> }) {
  return (
    <span className="macro-dots">
      <span>
        <i style={{ background: 'var(--ring-protein)' }} />P {fmtInt(m.protein)}g
      </span>
      <span>
        <i style={{ background: 'var(--ring-carbs)' }} />C {fmtInt(m.carbs)}g
      </span>
      <span>
        <i style={{ background: 'var(--ring-fat)' }} />G {fmtInt(m.fat)}g
      </span>
    </span>
  );
}

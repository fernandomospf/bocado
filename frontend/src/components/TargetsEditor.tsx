'use client';

import { useEffect, useRef } from 'react';
import { parseNum } from '@/lib/format';
import type { Macros } from '@/lib/types';

export type TargetsDraft = Record<keyof Macros, string>;

export const toDraft = (m: Macros): TargetsDraft => ({
  kcal: String(m.kcal),
  protein: String(m.protein),
  carbs: String(m.carbs),
  fat: String(m.fat),
});

export const fromDraft = (d: TargetsDraft): Macros => ({
  kcal: Math.round(parseNum(d.kcal)),
  protein: Math.round(parseNum(d.protein)),
  carbs: Math.round(parseNum(d.carbs)),
  fat: Math.round(parseNum(d.fat)),
});

type MacroKey = 'protein' | 'carbs' | 'fat';

const KCAL_PER_G: Record<MacroKey, number> = { protein: 4, carbs: 4, fat: 9 };

const FIELDS: { key: MacroKey; label: string; color: string }[] = [
  { key: 'protein', label: 'Proteína', color: 'var(--ring-protein)' },
  { key: 'carbs', label: 'Carboidratos', color: 'var(--ring-carbs)' },
  { key: 'fat', label: 'Gorduras', color: 'var(--ring-fat)' },
];

const DEFAULT_FAT_SHARE = 0.25;

const macroKcal = (m: Pick<Macros, MacroKey>) => m.protein * 4 + m.carbs * 4 + m.fat * 9;

/**
 * Referência usada ao mudar as calorias: proteína em gramas (vem do peso corporal,
 * não das calorias) e a fatia de gordura em % das kcal.
 */
interface Anchor {
  protein: number;
  fatShare: number;
}

function anchorFrom(m: Macros): Anchor {
  const total = macroKcal(m);
  const fatShare = total > 0 ? (m.fat * 9) / total : DEFAULT_FAT_SHARE;
  return { protein: m.protein, fatShare: Number.isFinite(fatShare) ? fatShare : DEFAULT_FAT_SHARE };
}

/**
 * Redistribui os macros para uma nova meta de calorias:
 * proteína mantida, gordura no mesmo percentual, carboidratos completam.
 * Se a proteína sozinha não couber, proteína e gordura são reduzidas na mesma proporção.
 */
export function rebalance(kcal: number, anchor: Anchor): Pick<Macros, MacroKey> {
  if (kcal <= 0) return { protein: 0, carbs: 0, fat: 0 };

  let protein = anchor.protein;
  let fat = Math.round((kcal * anchor.fatShare) / 9);
  let carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);

  if (carbs < 0) {
    const ratio = kcal / (protein * 4 + fat * 9);
    protein = Math.floor(protein * ratio);
    fat = Math.floor(fat * ratio);
    carbs = Math.max(0, Math.floor((kcal - protein * 4 - fat * 9) / 4));
  }
  return { protein, carbs, fat };
}

interface TargetsEditorProps {
  value: TargetsDraft;
  onChange: (v: TargetsDraft) => void;
}

/**
 * Metas diárias sempre coerentes:
 * - mudar as calorias redistribui os macros;
 * - mudar um macro recalcula as calorias (4/4/9).
 */
export function TargetsEditor({ value, onChange }: TargetsEditorProps) {
  const anchor = useRef<Anchor>(anchorFrom(fromDraft(value)));
  const editingKcal = useRef(false);

  // Valor trocado de fora (ex.: "Usar sugestão") ou macro editado: vira a nova referência.
  // Enquanto o usuário digita as calorias, a referência fica parada para os valores
  // intermediários ("2", "27", "270"...) não destruírem a proteína escolhida.
  useEffect(() => {
    if (!editingKcal.current) anchor.current = anchorFrom(fromDraft(value));
  }, [value]);

  function changeKcal(raw: string) {
    editingKcal.current = true;
    const kcal = Math.round(parseNum(raw));
    const m = rebalance(kcal, anchor.current);
    onChange({ kcal: raw, protein: String(m.protein), carbs: String(m.carbs), fat: String(m.fat) });
  }

  function changeMacro(key: MacroKey, raw: string) {
    editingKcal.current = false;
    const next = { ...value, [key]: raw };
    const t = fromDraft(next);
    onChange({ ...next, kcal: String(macroKcal(t)) });
  }

  const t = fromDraft(value);
  const total = macroKcal(t);

  return (
    <div className="stack">
      <label className="field">
        <span className="field-label" style={{ color: 'var(--ring-kcal)' }}>
          Calorias por dia
        </span>
        <div className="input-suffix">
          <input
            className="input num"
            inputMode="numeric"
            value={value.kcal}
            onChange={(e) => changeKcal(e.target.value)}
            onBlur={() => {
              editingKcal.current = false;
            }}
          />
          <span>kcal</span>
        </div>
      </label>

      <div className="grid-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        {FIELDS.map((f) => {
          const pct = total > 0 ? Math.round(((t[f.key] * KCAL_PER_G[f.key]) / total) * 100) : 0;
          return (
            <label key={f.key} className="field">
              <span className="field-label" style={{ color: f.color }}>
                {f.label}
              </span>
              <div className="input-suffix">
                <input
                  className="input num"
                  inputMode="numeric"
                  value={value[f.key]}
                  onChange={(e) => changeMacro(f.key, e.target.value)}
                />
                <span>g</span>
              </div>
              <span className="caption num" style={{ paddingLeft: 4 }}>
                {pct}% das kcal
              </span>
            </label>
          );
        })}
      </div>

      <p className="caption">
        Ao mudar as calorias, a proteína é mantida e gorduras e carboidratos se ajustam. Ao mudar um macro, as
        calorias são recalculadas.
      </p>
    </div>
  );
}

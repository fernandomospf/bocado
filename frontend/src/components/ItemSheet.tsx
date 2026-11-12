'use client';

import { useEffect, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { fmtDec, fmtInt, parseNum, round1 } from '@/lib/format';
import type { Meal, MealItem } from '@/lib/types';
import { Sheet } from './Sheet';

interface ItemSheetProps {
  meal: Meal | null;
  item: MealItem | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Detalhes de um alimento: ajustar a porção (macros escalam junto) ou remover. */
export function ItemSheet({ meal, item, onClose, onChanged }: ItemSheetProps) {
  const [grams, setGrams] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) setGrams(String(item.grams).replace('.', ','));
    setError(null);
  }, [item]);

  if (!meal || !item) return null;

  const newGrams = parseNum(grams);
  const factor = item.grams > 0 ? newGrams / item.grams : 1;
  const scaled = {
    grams: round1(newGrams),
    kcal: round1(item.kcal * factor),
    protein: round1(item.protein * factor),
    carbs: round1(item.carbs * factor),
    fat: round1(item.fat * factor),
  };
  const changed = item.grams > 0 && newGrams > 0 && Math.abs(newGrams - item.grams) >= 0.1;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() => api(`/meals/${meal.id}/items/${item.id}`, { method: 'PATCH', json: scaled }));
  const removeItem = () => run(() => api(`/meals/${meal.id}/items/${item.id}`, { method: 'DELETE' }));
  const removeMeal = () => run(() => api(`/meals/${meal.id}`, { method: 'DELETE' }));

  const shown = changed ? scaled : item;

  return (
    <Sheet open title={item.name} onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="title">{item.name}</h2>
          <p className="body-2 num">{fmtInt(shown.kcal)} kcal</p>
        </div>

        <div className="grid-4">
          {(
            [
              ['Proteína', shown.protein, 'var(--ring-protein)'],
              ['Carbo.', shown.carbs, 'var(--ring-carbs)'],
              ['Gordura', shown.fat, 'var(--ring-fat)'],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label} className="stat">
              <span className="caption" style={{ color }}>
                {label}
              </span>
              <strong>{fmtDec(value)} g</strong>
            </div>
          ))}
        </div>

        {item.grams > 0 && (
          <label className="field">
            <span className="field-label">Porção</span>
            <div className="input-suffix">
              <input
                className="input num"
                inputMode="decimal"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
              />
              <span>g</span>
            </div>
          </label>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          {changed && (
            <button className="btn btn-primary btn-block" onClick={save} disabled={busy}>
              Salvar porção
            </button>
          )}
          <button className="btn btn-glass btn-block btn-danger" onClick={removeItem} disabled={busy}>
            Remover alimento
          </button>
          {meal.items.length > 1 && (
            <button className="btn btn-plain btn-danger" onClick={removeMeal} disabled={busy}>
              Remover refeição inteira ({meal.items.length} itens)
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

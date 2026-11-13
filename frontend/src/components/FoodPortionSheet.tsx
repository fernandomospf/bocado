'use client';

import { useState } from 'react';
import { errorMessage } from '@/lib/api';
import { fmtDec, fmtInt, parseNum } from '@/lib/format';
import type { FoodResult } from '@/lib/types';
import { type DraftItem, draftFromPer100, scalePer100 } from './ItemsEditor';
import { Sheet } from './Sheet';

export const ORIGIN_LABEL: Record<FoodResult['origin'], string> = {
  history: 'Você já comeu',
  recipe: 'Receita',
  custom: 'Seu alimento',
  taco: 'TACO',
};

const MULTIPLIERS = [
  { label: '½', factor: 0.5 },
  { label: '1', factor: 1 },
  { label: '2', factor: 2 },
];

const fmtGrams = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

interface FoodPortionSheetProps {
  food: FoodResult;
  onClose: () => void;
  /** Pode ser assíncrono (ex.: registrar direto na tela Hoje); erros aparecem no próprio Sheet. */
  onAdd: (item: DraftItem) => void | Promise<void>;
  /** Onde o item vai entrar, ex.: "Almoço · Hoje". */
  context?: string;
  actionLabel?: string;
}

/** Escolha da quantidade de um alimento da busca, com prévia dos macros. */
export function FoodPortionSheet({ food, onClose, onAdd, context, actionLabel = 'Adicionar' }: FoodPortionSheetProps) {
  const [grams, setGrams] = useState(fmtGrams(food.portion?.grams ?? 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = parseNum(grams);
  const m = scalePer100(food.per100, value);
  const portionGrams = food.portion?.grams;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      // foodId só para alimentos da base (TACO ou próprios); receitas e histórico não são um Food
      const foodId = food.origin === 'taco' || food.origin === 'custom' ? food.id : undefined;
      await onAdd(draftFromPer100(food.name, food.per100, value, foodId));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open title={food.name} onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 6 }}>
          <span className={`badge badge-origin-${food.origin}`} style={{ alignSelf: 'flex-start' }}>
            {ORIGIN_LABEL[food.origin]}
          </span>
          <h2 className="title">{food.name}</h2>
          {context && <p className="caption">{context}</p>}
          <p className="body-2 num">{fmtInt(m.kcal)} kcal</p>
        </div>

        <div className="grid-4">
          {(
            [
              ['Proteína', m.protein, 'var(--ring-protein)'],
              ['Carbo.', m.carbs, 'var(--ring-carbs)'],
              ['Gordura', m.fat, 'var(--ring-fat)'],
            ] as const
          ).map(([label, v, color]) => (
            <div key={label} className="stat">
              <span className="caption" style={{ color }}>
                {label}
              </span>
              <strong>{fmtDec(v)} g</strong>
            </div>
          ))}
        </div>

        <label className="field">
          <span className="field-label">Quantidade</span>
          <div className="input-suffix">
            <input
              className="input num"
              inputMode="decimal"
              value={grams}
              onChange={(e) => setGrams(e.target.value)}
              autoFocus={!portionGrams}
            />
            <span>g</span>
          </div>
        </label>

        {portionGrams && food.portion && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="caption">
              Porção: {food.portion.label} ({fmtGrams(portionGrams)} g)
            </span>
            <div className="segmented" role="group" aria-label="Porções rápidas">
              {MULTIPLIERS.map(({ label, factor }) => {
                const g = portionGrams * factor;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={Math.abs(value - g) < 0.05}
                    onClick={() => setGrams(fmtGrams(g))}
                  >
                    {label} × <span className="num">{fmtGrams(g)} g</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {food.whole && (
          <button
            type="button"
            className="btn btn-glass btn-block"
            aria-pressed={Math.abs(value - food.whole.grams) < 0.05}
            onClick={() => setGrams(fmtGrams(food.whole!.grams))}
          >
            Receita inteira · <span className="num">{fmtGrams(food.whole.grams)} g</span>
          </button>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <button className="btn btn-primary btn-block" disabled={!(value > 0) || busy} onClick={add}>
          {busy ? <span className="spinner" aria-label="Salvando" /> : actionLabel}
        </button>
      </div>
    </Sheet>
  );
}

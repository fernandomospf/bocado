'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtDec, fmtInt, parseNum } from '@/lib/format';
import type { FoodResult } from '@/lib/types';
import { type DraftItem, draftFromPer100, scalePer100 } from './ItemsEditor';
import { ConfirmLabel } from './ConfirmLabel';
import { Sheet } from './Sheet';
import { NO_SPLIT, SplitPicker, type SplitState, splitIncomplete, splitReady } from './SplitPicker';
import { useToast } from './Toast';
import { VerifiedBadge } from './VerifiedBadge';

export const ORIGIN_LABEL: Record<FoodResult['origin'], string> = {
  history: 'Você já comeu',
  recipe: 'Receita',
  custom: 'Seu alimento',
  off: 'Open Food Facts',
  label: 'Acervo Bocado',
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
  onAdd: (item: DraftItem, split?: SplitState) => void | Promise<void>;
  /** Mostra "Dividir com a casa" (só onde o botão salva direto a refeição). */
  splittable?: boolean;
  /** Onde o item vai entrar, ex.: "Almoço · Hoje". */
  context?: string;
  actionLabel?: string;
}

/** Escolha da quantidade de um alimento da busca, com prévia dos macros. */
export function FoodPortionSheet({ food, onClose, onAdd, context, actionLabel = 'Adicionar', splittable }: FoodPortionSheetProps) {
  const [split, setSplit] = useState<SplitState>(NO_SPLIT);
  const [grams, setGrams] = useState(fmtGrams(food.portion?.grams ?? 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const { hideCalories: hide } = useDisplayPrefs();
  // "Informar erro": só produtos do acervo compartilhado (Open Food Facts e rótulos)
  const reportable = (food.origin === 'off' || food.origin === 'label') && !!food.id;
  const [reporting, setReporting] = useState<{ open: boolean; reason: string; busy: boolean }>({ open: false, reason: '', busy: false });

  async function sendReport() {
    setReporting((r) => ({ ...r, busy: true }));
    try {
      await api(`/foods/${food.id}/report`, { method: 'POST', json: { reason: reporting.reason.trim() } });
      toast.show({ message: 'Obrigado! Vamos revisar esse produto.' });
      setReporting({ open: false, reason: '', busy: false });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setReporting((r) => ({ ...r, busy: false }));
    }
  }
  const value = parseNum(grams);
  const m = scalePer100(food.per100, value);
  const portionGrams = food.portion?.grams;

  async function add() {
    setBusy(true);
    setError(null);
    try {
      // foodId só para registros da base de alimentos; receitas e histórico não são um Food
      const foodId = ['taco', 'custom', 'off', 'label'].includes(food.origin) ? food.id : undefined;
      const draft = draftFromPer100(food.name, food.per100, value, foodId);
      const item = food.origin === 'recipe' ? { ...draft, recipeId: food.id } : draft;
      await onAdd(item, splittable && splitReady(split) ? split : undefined);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open title={food.name} onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 6 }}>
          <span className="badge-row" style={{ alignSelf: 'flex-start' }}>
            <span className={`badge badge-origin-${food.origin}`}>{ORIGIN_LABEL[food.origin]}</span>
            {food.verified && <VerifiedBadge />}
          </span>
          <h2 className="title">{food.name}</h2>
          {food.brand && <p className="body-2">{food.brand}</p>}
          {context && <p className="caption">{context}</p>}
          {!hide && <p className="body-2 num">{fmtInt(m.kcal)} kcal</p>}
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
              Porção: {food.portion.label}
              {/* rótulos de produto já trazem o peso ("15 g (1 colher de sopa)"): não repete */}
              {/\d\s*(g|ml)\b/i.test(food.portion.label) ? '' : ` (${fmtGrams(portionGrams)} g)`}
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

        {food.origin === 'off' && (
          <p className="caption">
            Dados:{' '}
            <a className="text-link" href="https://world.openfoodfacts.org" target="_blank" rel="noopener noreferrer">
              Open Food Facts
            </a>{' '}
            (ODbL)
          </p>
        )}

        {reportable && food.id && <ConfirmLabel foodId={food.id} />}

        {reportable &&
          (reporting.open ? (
            <div className="stack" style={{ gap: 8 }}>
              <label className="field">
                <span className="field-label">O que está errado?</span>
                <input
                  className="input"
                  placeholder="Ex.: as calorias não batem com a embalagem"
                  value={reporting.reason}
                  maxLength={200}
                  onChange={(e) => setReporting((r) => ({ ...r, reason: e.target.value }))}
                  autoFocus
                />
              </label>
              <div className="suggestion-actions">
                <button
                  type="button"
                  className="btn btn-glass btn-sm"
                  onClick={sendReport}
                  disabled={reporting.busy || reporting.reason.trim().length < 3}
                >
                  {reporting.busy ? <span className="spinner" aria-label="Enviando" /> : 'Enviar'}
                </button>
                <button type="button" className="btn btn-plain btn-sm" onClick={() => setReporting({ open: false, reason: '', busy: false })}>
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-plain btn-sm"
              style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
              onClick={() => setReporting((r) => ({ ...r, open: true }))}
            >
              Informar erro
            </button>
          ))}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {splittable && <SplitPicker value={split} onChange={setSplit} totalKcal={m.kcal} totalProtein={m.protein} />}

        <button
          className="btn btn-primary btn-block"
          disabled={!(value > 0) || busy || (splittable && splitIncomplete(split))}
          onClick={add}
        >
          {busy ? <span className="spinner" aria-label="Salvando" /> : actionLabel}
        </button>
      </div>
    </Sheet>
  );
}

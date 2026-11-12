'use client';

import { fmtInt, parseNum, round1 } from '@/lib/format';
import type { Confidence } from '@/lib/types';
import { TrashIcon } from './Icons';

export interface DraftItem {
  key: string;
  name: string;
  grams: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  confidence?: Confidence;
  /** Referência para escalar macros quando a porção muda. */
  base?: { grams: number; kcal: number; protein: number; carbs: number; fat: number };
}

type MacroField = 'kcal' | 'protein' | 'carbs' | 'fat';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Confira',
  medium: 'Provável',
  high: 'Confiável',
};

// crypto.randomUUID só existe em contexto seguro (HTTPS); em http na rede local cai no fallback
const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const str = (n: number) => String(round1(n)).replace('.', ',');

export function newDraft(partial: Partial<DraftItem> = {}): DraftItem {
  return {
    key: uid(),
    name: '',
    grams: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
    ...partial,
  };
}

export function draftFromAnalysis(i: {
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: Confidence;
}): DraftItem {
  return newDraft({
    name: i.name,
    grams: str(i.grams),
    kcal: str(i.kcal),
    protein: str(i.protein),
    carbs: str(i.carbs),
    fat: str(i.fat),
    confidence: i.confidence,
    base: { grams: i.grams, kcal: i.kcal, protein: i.protein, carbs: i.carbs, fat: i.fat },
  });
}

/** kcal digitada ou, se vazia, estimada pelos macros (4/4/9). */
export function resolveKcal(d: DraftItem) {
  const typed = parseNum(d.kcal);
  if (d.kcal.trim() !== '') return typed;
  return parseNum(d.protein) * 4 + parseNum(d.carbs) * 4 + parseNum(d.fat) * 9;
}

export function toPayload(d: DraftItem) {
  return {
    name: d.name.trim(),
    grams: round1(parseNum(d.grams)),
    kcal: round1(resolveKcal(d)),
    protein: round1(parseNum(d.protein)),
    carbs: round1(parseNum(d.carbs)),
    fat: round1(parseNum(d.fat)),
  };
}

interface ItemsEditorProps {
  items: DraftItem[];
  onChange: (items: DraftItem[]) => void;
}

export function ItemsEditor({ items, onChange }: ItemsEditorProps) {
  const update = (key: string, patch: Partial<DraftItem>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));

  function setGrams(item: DraftItem, value: string) {
    const grams = parseNum(value);
    if (item.base && item.base.grams > 0 && grams > 0) {
      const f = grams / item.base.grams;
      update(item.key, {
        grams: value,
        kcal: str(item.base.kcal * f),
        protein: str(item.base.protein * f),
        carbs: str(item.base.carbs * f),
        fat: str(item.base.fat * f),
      });
    } else {
      update(item.key, { grams: value });
    }
  }

  function setMacro(item: DraftItem, field: MacroField, value: string) {
    const next = { ...item, [field]: value };
    const grams = parseNum(next.grams);
    // Edição manual vira a nova referência para escalar a porção
    next.base =
      grams > 0
        ? {
            grams,
            kcal: resolveKcal(next),
            protein: parseNum(next.protein),
            carbs: parseNum(next.carbs),
            fat: parseNum(next.fat),
          }
        : undefined;
    update(item.key, next);
  }

  return (
    <div className="stack">
      {items.map((item, index) => {
        const kcalPlaceholder = fmtInt(resolveKcal({ ...item, kcal: '' }));
        return (
          <div key={item.key} className="item-editor fade-in">
            <div className="row">
              <label className="sr-only" htmlFor={`name-${item.key}`}>
                Alimento {index + 1}
              </label>
              <input
                id={`name-${item.key}`}
                className="input"
                placeholder="Alimento"
                value={item.name}
                onChange={(e) => update(item.key, { name: e.target.value })}
              />
              <div className="input-suffix" style={{ width: 104, flex: 'none' }}>
                <input
                  className="input num"
                  inputMode="decimal"
                  aria-label="Porção em gramas"
                  placeholder="0"
                  value={item.grams}
                  onChange={(e) => setGrams(item, e.target.value)}
                />
                <span>g</span>
              </div>
            </div>

            <div className="grid-4">
              {(
                [
                  ['kcal', 'kcal', 'var(--ring-kcal)'],
                  ['protein', 'Prot.', 'var(--ring-protein)'],
                  ['carbs', 'Carb.', 'var(--ring-carbs)'],
                  ['fat', 'Gord.', 'var(--ring-fat)'],
                ] as const
              ).map(([field, label, color]) => (
                <div key={field} className="mini-field">
                  <label htmlFor={`${field}-${item.key}`} style={{ color }}>
                    {label}
                  </label>
                  <input
                    id={`${field}-${item.key}`}
                    className="input"
                    inputMode="decimal"
                    placeholder={field === 'kcal' ? kcalPlaceholder : '0'}
                    value={item[field]}
                    onChange={(e) => setMacro(item, field, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <div className="spread">
              {item.confidence ? (
                <span className={`badge badge-${item.confidence}`}>{CONFIDENCE_LABEL[item.confidence]}</span>
              ) : (
                <span className="caption">kcal em branco é calculada pelos macros</span>
              )}
              <button
                type="button"
                className="btn btn-plain btn-danger btn-sm"
                onClick={() => onChange(items.filter((it) => it.key !== item.key))}
                aria-label={`Remover ${item.name || 'alimento'}`}
              >
                <TrashIcon width={18} height={18} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

'use client';

import { useId, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { dayTitle, isValidISO, todayISO } from '@/lib/date';
import { fmtInt, parseNum, round1 } from '@/lib/format';
import { success as hapticSuccess, tap } from '@/lib/haptics';
import { MEAL_ORDER, MEAL_SHORT } from '@/lib/labels';
import { useQuickMeals } from '@/lib/quickMeals';
import { useMealRemoval } from '@/lib/useMealRemoval';
import type { Meal, MealItem, MealType } from '@/lib/types';
import { EstimateBadge } from './EstimateBadge';
import { StarIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

interface ItemSheetProps {
  meal: Meal | null;
  item: MealItem | null;
  onClose: () => void;
  onChanged: () => void;
}

type MacroField = 'kcal' | 'protein' | 'carbs' | 'fat';
type Values = { grams: number } & Record<MacroField, number>;

const MACROS: { field: MacroField; label: string; color: string }[] = [
  { field: 'kcal', label: 'kcal', color: 'var(--ring-kcal)' },
  { field: 'protein', label: 'Prot.', color: 'var(--ring-protein)' },
  { field: 'carbs', label: 'Carb.', color: 'var(--ring-carbs)' },
  { field: 'fat', label: 'Gord.', color: 'var(--ring-fat)' },
];

const text = (n: number) => String(round1(n)).replace('.', ',');

/** Editar um alimento já salvo: nome, porção, macros, refeição e dia (mover). */
export function ItemSheet({ meal, item, ...props }: ItemSheetProps) {
  if (!meal || !item) return null;
  // key: o formulário começa do zero a cada alimento aberto
  return <ItemForm key={item.id} meal={meal} item={item} {...props} />;
}

function ItemForm({ meal, item, onClose, onChanged }: ItemSheetProps & { meal: Meal; item: MealItem }) {
  const id = useId();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { remove } = useMealRemoval();
  const { saveFavorite } = useQuickMeals();
  const today = todayISO();

  const [name, setName] = useState(item.name);
  const [grams, setGrams] = useState(text(item.grams));
  const [macros, setMacros] = useState<Record<MacroField, string>>({
    kcal: text(item.kcal),
    protein: text(item.protein),
    carbs: text(item.carbs),
    fat: text(item.fat),
  });
  // Escala proporcional: só faz sentido com porção em gramas (itens "só kcal" têm 0 g)
  const canScale = item.grams > 0;
  const [scale, setScale] = useState(canScale);
  // Referência da escala: os valores no momento em que ela foi ligada (no início, os do item salvo)
  const [base, setBase] = useState<Values>(item);
  const [type, setType] = useState<MealType>(meal.type);
  const [date, setDate] = useState(meal.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current: Values = {
    grams: round1(parseNum(grams)),
    kcal: round1(parseNum(macros.kcal)),
    protein: round1(parseNum(macros.protein)),
    carbs: round1(parseNum(macros.carbs)),
    fat: round1(parseNum(macros.fat)),
  };
  // Só o que mudou vai no PATCH: mandar gramas iguais desligaria a "estimativa" no servidor
  const patch: Partial<Values & { name: string }> = {};
  if (name.trim() !== item.name) patch.name = name.trim();
  for (const k of ['grams', 'kcal', 'protein', 'carbs', 'fat'] as const) {
    if (current[k] !== item[k]) patch[k] = current[k];
  }
  const valuesChanged = Object.keys(patch).length > 0;
  const moved = type !== meal.type || date !== meal.date;
  const valid = name.trim().length > 0 && isValidISO(date) && date <= today;

  function changeGrams(value: string) {
    setGrams(value);
    const g = parseNum(value);
    if (!scale || base.grams <= 0 || g <= 0) return;
    const f = g / base.grams;
    setMacros({
      kcal: text(base.kcal * f),
      protein: text(base.protein * f),
      carbs: text(base.carbs * f),
      fat: text(base.fat * f),
    });
  }

  function changeMacro(field: MacroField, value: string) {
    setMacros((m) => ({ ...m, [field]: value }));
    setScale(false); // macro à mão: a porção para de recalcular os macros
  }

  function toggleScale(on: boolean) {
    setScale(on);
    if (on) setBase(current);
  }

  /** Revalida os dias envolvidos, a faixa da semana/histórico e o "Para fechar o dia". */
  const revalidate = (days: string[]) =>
    mutate(
      (key) =>
        typeof key === 'string' &&
        (days.some((d) => key === `/days/${d}`) || key.startsWith('/days?') || key.startsWith('/suggestions/close-day')),
    );

  async function run(action: () => Promise<{ days: string[]; message: string }>) {
    setBusy(true);
    setError(null);
    try {
      const { days, message } = await action();
      await revalidate(days);
      onChanged();
      toast.show({ message });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      if (valuesChanged) await api(`/meals/${meal.id}/items/${item.id}`, { method: 'PATCH', json: patch });
      if (!moved) {
        hapticSuccess();
        return { days: [meal.date], message: 'Alimento atualizado' };
      }
      const res = await api<{ fromDate: string; toDate: string; mealId: string }>(
        `/meals/${meal.id}/items/${item.id}/move`,
        { method: 'POST', json: { type, date } },
      );
      hapticSuccess();
      const where = res.toDate === res.fromDate ? '' : ` · ${dayTitle(res.toDate)}`;
      return { days: [res.fromDate, res.toDate], message: `Movido para ${MEAL_SHORT[type]}${where}` };
    });

  // Sem confirmação: some na hora e o toast oferece "Desfazer"
  const removeItem = () => {
    onClose();
    void remove(meal, item);
  };

  const removeMeal = () => {
    onClose();
    void remove(meal);
  };

  return (
    <Sheet open title={`Editar ${item.name}`} onClose={onClose}>
      <form
        className="stack-lg item-form"
        onSubmit={(e) => {
          e.preventDefault();
          if ((valuesChanged || moved) && valid && !busy) void save();
        }}
      >
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="title">{name.trim() || item.name}</h2>
          <div className="estimate-host">
            <p className="body-2 num">{fmtInt(current.kcal)} kcal</p>
            {/* Mexeu nos valores: deixam de ser a estimativa da IA (o servidor também desliga ao salvar) */}
            {item.estimated && !Object.keys(patch).some((k) => k !== 'name') && <EstimateBadge />}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Nome</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>

        <div className="stack" style={{ gap: 8 }}>
          <label className="field">
            <span className="field-label">Porção</span>
            <div className="input-suffix">
              <input
                className="input num"
                inputMode="decimal"
                aria-label="Porção em gramas"
                value={grams}
                onChange={(e) => changeGrams(e.target.value)}
              />
              <span aria-hidden>g</span>
            </div>
          </label>
          {canScale && (
            <label className="switch-row">
              <span>Ajustar macros junto com a porção</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={scale}
                onChange={(e) => toggleScale(e.target.checked)}
              />
            </label>
          )}
        </div>

        <div className="grid-4">
          {MACROS.map(({ field, label, color }) => (
            <div key={field} className="mini-field">
              <label htmlFor={`${id}-${field}`} style={{ color }}>
                {label}
              </label>
              <input
                id={`${id}-${field}`}
                className="input"
                inputMode="decimal"
                value={macros[field]}
                onChange={(e) => changeMacro(field, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="field">
          <span className="field-label" id={`${id}-meal`}>
            Refeição
          </span>
          <div className="segmented" role="group" aria-labelledby={`${id}-meal`}>
            {MEAL_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={type === t}
                onClick={() => {
                  if (t !== type) tap();
                  setType(t);
                }}
              >
                {MEAL_SHORT[t]}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span className="field-label">Dia</span>
          <input
            className="input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => isValidISO(e.target.value) && setDate(e.target.value)}
          />
        </label>

        {moved && (
          <p className="caption" style={{ paddingLeft: 4 }}>
            Vai para {MEAL_SHORT[type]} · {dayTitle(date)}
          </p>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !valid || !(valuesChanged || moved)}>
            {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar'}
          </button>
          <button type="button" className="btn btn-glass btn-block" onClick={() => void saveFavorite(meal.id)} disabled={busy}>
            <StarIcon width={18} height={18} />
            Salvar refeição como favorita
          </button>
          <button type="button" className="btn btn-glass btn-block btn-danger" onClick={removeItem} disabled={busy}>
            Remover alimento
          </button>
          {meal.items.length > 1 && (
            <button type="button" className="btn btn-plain btn-danger" onClick={removeMeal} disabled={busy}>
              Remover refeição inteira ({meal.items.length} itens)
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

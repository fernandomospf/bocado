'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { success as hapticSuccess } from '@/lib/haptics';
import type { CloseDayResponse, Macros, MealSuggestion, MealType, SuggestionOrigin } from '@/lib/types';
import { CloseIcon, SparkIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** A partir deste horário (local) o card aparece. */
const FROM_HOUR = 18;
/** Depois deste horário, a sugestão é um lanche (ceia), não um jantar. */
const SNACK_FROM_HOUR = 21;
/** Rascunho lido pela Nova refeição ("Usar": entra preenchida e editável). */
export const PREFILL_KEY = 'bocado:prefill';

const ORIGIN_BADGE: Record<SuggestionOrigin, { label: string; className: string }> = {
  history: { label: 'Você já comeu', className: 'badge-origin-history' },
  template: { label: 'Sugestão Bocado', className: 'badge-origin-template' },
  pantry: { label: 'Com o que você tem', className: 'badge-origin-pantry' },
  ai: { label: 'Criada com IA', className: 'badge-origin-ai' },
};

const dismissKey = (date: string) => `bocado:closeDay:dismissed:${date}`;
const pantryKey = (date: string) => `bocado:pantry:${date}`;

/** Itens no formato da API de refeições (sem o rótulo de exibição). */
const toMealItems = (s: MealSuggestion) =>
  s.items.map(({ name, grams, kcal, protein, carbs, fat }) => ({ name, grams, kcal, protein, carbs, fat }));

interface CloseDayCardProps {
  date: string;
  isToday: boolean;
  /** kcal já registradas no dia: quando muda, as sugestões são recalculadas. */
  eatenKcal: number;
}

/**
 * "Para fechar o dia": a partir das 18h, uma refeição que cubra o que falta.
 * Base local primeiro (o que a pessoa já comeu → pratos comuns); a IA só se pedirem e o local não bastar.
 */
export function CloseDayCard({ date, isToday, eatenKcal }: CloseDayCardProps) {
  const router = useRouter();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();

  // Horário, "dispensado" e despensa só no navegador: a página é pré-renderizada no build
  const [hour, setHour] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [pantryText, setPantryText] = useState('');

  useEffect(() => {
    setHour(new Date().getHours());
    setDismissed(localStorage.getItem(dismissKey(date)) === '1');
    setPantryText(localStorage.getItem(pantryKey(date)) ?? '');
  }, [date]);

  const visible = isToday && hour !== null && hour >= FROM_HOUR && !dismissed;
  const meal: 'DINNER' | 'SNACK' = hour !== null && hour >= SNACK_FROM_HOUR ? 'SNACK' : 'DINNER';
  const mealLabel = meal === 'SNACK' ? 'lanche' : 'jantar';
  const { data, mutate } = useSWR<CloseDayResponse>(visible ? `/suggestions/close-day?date=${date}&meal=${meal}` : null, {
    revalidateOnFocus: false,
  });

  /** Resultado que sobrepõe o local: despensa ou IA. */
  const [override, setOverride] = useState<CloseDayResponse | null>(null);
  const [busy, setBusy] = useState<'pantry' | 'ai' | 'log' | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Registrou algo no dia: o que falta mudou
  const lastKcal = useRef(eatenKcal);
  useEffect(() => {
    if (visible && lastKcal.current !== eatenKcal) {
      lastKcal.current = eatenKcal;
      setOverride(null);
      void mutate();
    }
  }, [eatenKcal, visible, mutate]);

  if (!visible || !data || !data.remaining) return null;

  const dismiss = () => {
    localStorage.setItem(dismissKey(date), '1');
    setDismissed(true);
  };

  const dismissButton = (
    <button type="button" className="btn btn-plain btn-icon" onClick={dismiss} aria-label="Dispensar por hoje">
      <CloseIcon width={18} height={18} />
    </button>
  );

  if (data.closed) {
    return (
      <section className="card glass close-day" aria-label="Para fechar o dia">
        <div className="spread">
          <div>
            <h2 className="headline">Dia fechado</h2>
            <p className="caption">Você chegou perto da meta de hoje.</p>
          </div>
          {dismissButton}
        </div>
      </section>
    );
  }

  const view = override ?? data;
  const target = view.target ?? data.target ?? data.remaining;
  const list = view.suggestions;
  const best = list[0];
  const pantryTerms = override?.pantry ? [...override.pantry.recognized.map((r) => r.term), ...override.pantry.unknown] : [];

  function use(s: MealSuggestion) {
    sessionStorage.setItem(PREFILL_KEY, JSON.stringify({ date, type: meal as MealType, items: toMealItems(s) }));
    router.push(`/add?type=${meal}&date=${date}&prefill=1`);
  }

  async function logDirect(s: MealSuggestion) {
    setBusy('log');
    try {
      await api('/suggestions/log', { method: 'POST', json: { date, type: meal, items: toMealItems(s) } });
      hapticSuccess();
      toast.show({ message: `${meal === 'SNACK' ? 'Lanche' : 'Jantar'} registrado · +${fmtInt(s.totals.kcal)} kcal` });
      setShowAll(false);
      await globalMutate(`/days/${date}`);
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function submitPantry(e?: FormEvent) {
    e?.preventDefault();
    const text = pantryText.trim();
    if (!text) {
      setOverride(null);
      localStorage.removeItem(pantryKey(date));
      return;
    }
    localStorage.setItem(pantryKey(date), text);
    setBusy('pantry');
    try {
      setOverride(await api<CloseDayResponse>('/suggestions/close-day/pantry', { method: 'POST', json: { date, meal, text } }));
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function askAi() {
    setBusy('ai');
    try {
      const res = await api<CloseDayResponse>('/suggestions/close-day/ai', {
        method: 'POST',
        json: { date, meal, ...(pantryTerms.length ? { ingredients: pantryTerms } : {}) },
      });
      if (res.suggestions.length === 0) {
        toast.show({ message: 'A IA não trouxe uma sugestão válida desta vez. Tente de novo.', tone: 'error' });
      } else {
        setOverride(res);
      }
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const addChip = (chip: string) => {
    const parts = pantryText
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.some((p) => p.toLowerCase() === chip.toLowerCase())) setPantryText([...parts, chip].join(', '));
  };

  const remainingLine = (
    <p className="body-2 num">
      Faltam {fmtInt(data.remaining.kcal)} kcal
      {data.remaining.protein >= 5 && <> · {fmtInt(data.remaining.protein)} g de proteína</>}
    </p>
  );

  const pantryForm = (idSuffix: string) => (
    <form className="pantry-form" onSubmit={submitPantry}>
      <label className="sr-only" htmlFor={`pantry-${idSuffix}`}>
        O que você tem em casa?
      </label>
      <input
        id={`pantry-${idSuffix}`}
        className="input"
        placeholder="Ex.: frango, ovos, arroz, batata"
        value={pantryText}
        maxLength={300}
        enterKeyHint="search"
        onChange={(e) => setPantryText(e.target.value)}
      />
      <button type="submit" className="btn btn-glass" disabled={busy === 'pantry'}>
        {busy === 'pantry' ? <span className="spinner" aria-label="Buscando" /> : 'Sugerir'}
      </button>
    </form>
  );

  const pantryFeedback = override?.pantry && override.pantry.unknown.length > 0 && (
    <p className="caption">Não reconhecemos: {override.pantry.unknown.join(', ')}.</p>
  );

  const aiButton = view.canAskAi && (
    <div className="stack" style={{ gap: 4 }}>
      <button type="button" className="btn btn-glass btn-block" onClick={askAi} disabled={busy === 'ai'}>
        {busy === 'ai' ? <span className="spinner" aria-label="Criando" /> : <SparkIcon width={20} height={20} />}
        {busy === 'ai' ? 'Criando' : pantryTerms.length ? 'Criar receita com IA (com o que tenho)' : 'Criar receita com IA'}
      </button>
      <p className="caption" style={{ textAlign: 'center' }}>
        {view.aiRemaining === 1 ? 'Resta 1 hoje' : `Restam ${view.aiRemaining} hoje`}
      </p>
    </div>
  );

  const empty = (
    <p className="body-2">Nenhuma combinação boa com o que temos. Diga o que tem em casa ou crie uma receita com IA.</p>
  );

  return (
    <section className="card glass close-day stack" aria-label="Para fechar o dia">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="headline">Para fechar o dia</h2>
          {remainingLine}
        </div>
        {dismissButton}
      </div>

      {pantryForm('card')}
      {pantryFeedback}

      {best ? (
        <SuggestionCard
          suggestion={best}
          target={target}
          busy={busy === 'log'}
          onUse={() => use(best)}
          onLog={() => logDirect(best)}
        />
      ) : (
        empty
      )}

      {list.length > 1 && (
        <button type="button" className="btn btn-plain" style={{ alignSelf: 'center' }} onClick={() => setShowAll(true)}>
          Ver outras ideias ({list.length - 1})
        </button>
      )}

      {aiButton}

      <p className="caption close-day-disclaimer">Sugestões aproximadas, não substituem um nutricionista.</p>

      {showAll && (
        <Sheet open title="Outras ideias" onClose={() => setShowAll(false)}>
          <div className="sheet-sticky stack" style={{ gap: 10 }}>
            <div>
              <h2 className="title">Ideias para o {mealLabel}</h2>
              {remainingLine}
            </div>
            {pantryForm('sheet')}
            {data.pantryChips.length > 0 && (
              <div className="pantry-chips" aria-label="Ingredientes que você mais usa">
                {data.pantryChips.map((chip) => (
                  <button key={chip} type="button" className="chip chip-sm" onClick={() => addChip(chip)}>
                    + {chip}
                  </button>
                ))}
              </div>
            )}
            {pantryFeedback}
          </div>

          <div className="stack" style={{ marginTop: 14 }}>
            {list.length
              ? list.map((s, i) => (
                  <SuggestionCard
                    key={`${s.title}-${i}`}
                    suggestion={s}
                    target={target}
                    busy={busy === 'log'}
                    onUse={() => use(s)}
                    onLog={() => logDirect(s)}
                  />
                ))
              : empty}
            {aiButton}
            <p className="caption close-day-disclaimer">Sugestões aproximadas, não substituem um nutricionista.</p>
          </div>
        </Sheet>
      )}
    </section>
  );
}

interface SuggestionCardProps {
  suggestion: MealSuggestion;
  target: Macros;
  busy: boolean;
  onUse: () => void;
  onLog: () => void;
}

/** Sugestão compacta: selo, título, itens com quantidade amigável, encaixe e ações discretas. */
function SuggestionCard({ suggestion: s, target, busy, onUse, onLog }: SuggestionCardProps) {
  const badge = ORIGIN_BADGE[s.mainOrigin];
  const pct = (value: number, of: number) => (of > 0 ? Math.round((value / of) * 100) : 0);
  const kcalPct = pct(s.totals.kcal, target.kcal);
  const proteinPct = pct(s.totals.protein, target.protein);

  return (
    <article className="suggestion-card" aria-label={s.title}>
      <div className="stack" style={{ gap: 4 }}>
        <span className={`badge ${badge.className}`} style={{ alignSelf: 'flex-start' }}>
          {badge.label}
        </span>
        <h3 className="headline suggestion-title">{s.title}</h3>
      </div>

      <ul className="suggestion-items">
        {s.items.map((item, i) => (
          <li key={`${item.name}-${i}`}>
            <span>{item.label}</span>
            <span className="caption num">{fmtInt(item.kcal)} kcal</span>
          </li>
        ))}
      </ul>

      <div className="fit-bars" aria-label={`Cobre ${kcalPct}% das calorias e ${proteinPct}% da proteína que faltam`}>
        <span aria-hidden>Kcal</span>
        <span className="fit-track" aria-hidden>
          <span className="fit-fill" style={{ display: 'block', width: `${Math.min(kcalPct, 100)}%`, background: 'var(--ring-kcal)' }} />
        </span>
        <span className="num" aria-hidden>
          {kcalPct}%
        </span>
        <span aria-hidden>Proteína</span>
        <span className="fit-track" aria-hidden>
          <span className="fit-fill" style={{ display: 'block', width: `${Math.min(proteinPct, 100)}%`, background: 'var(--ring-protein)' }} />
        </span>
        <span className="num" aria-hidden>
          {proteinPct}%
        </span>
      </div>

      {s.steps && s.steps.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <p className="caption">Modo de preparo{s.minutes ? ` · cerca de ${s.minutes} min` : ''}</p>
          <ol className="close-day-steps">
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      <div className="suggestion-actions">
        <button type="button" className="btn btn-primary btn-sm" onClick={onUse}>
          Usar
        </button>
        <button type="button" className="btn btn-plain btn-sm" onClick={onLog} disabled={busy}>
          Registrar direto
        </button>
      </div>
    </article>
  );
}

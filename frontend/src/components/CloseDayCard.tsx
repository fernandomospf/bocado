'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import type { CloseDayResponse, MealSuggestion, MealType, SuggestionOrigin } from '@/lib/types';
import { ChevronLeft, ChevronRight, CloseIcon, SparkIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** A partir deste horário (local) o card aparece. */
const FROM_HOUR = 18;
/** Depois deste horário, a sugestão é um lanche (ceia), não um jantar. */
const SNACK_FROM_HOUR = 21;
/** Rascunho lido pela Nova refeição (registrar a sugestão, editável). */
export const PREFILL_KEY = 'bocado:prefill';

const ORIGIN_BADGE: Record<SuggestionOrigin, { label: string; className: string }> = {
  history: { label: 'Do seu dia a dia', className: 'badge-origin-history' },
  recipe: { label: 'Receita', className: 'badge-origin-recipe' },
  taco: { label: 'TACO', className: 'badge-origin-taco' },
  ai: { label: 'Criada com IA', className: 'badge-origin-ai' },
};

const dismissKey = (date: string) => `bocado:closeDay:dismissed:${date}`;

interface CloseDayCardProps {
  date: string;
  isToday: boolean;
  /** kcal já registradas no dia: quando muda, as sugestões são recalculadas. */
  eatenKcal: number;
}

/**
 * "Para fechar o dia": a partir das 18h, uma refeição que cubra o que falta.
 * Primeiro a base local (sem IA); a IA só se a pessoa pedir e o local não bastar.
 */
export function CloseDayCard({ date, isToday, eatenKcal }: CloseDayCardProps) {
  const router = useRouter();
  const toast = useToast();
  // Horário e "dispensado" só no navegador: a página é pré-renderizada no build
  const [hour, setHour] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setHour(new Date().getHours());
    setDismissed(localStorage.getItem(dismissKey(date)) === '1');
  }, [date]);

  const visible = isToday && hour !== null && hour >= FROM_HOUR && !dismissed;
  const meal: 'DINNER' | 'SNACK' = hour !== null && hour >= SNACK_FROM_HOUR ? 'SNACK' : 'DINNER';
  const { data, mutate } = useSWR<CloseDayResponse>(visible ? `/suggestions/close-day?date=${date}&meal=${meal}` : null, {
    revalidateOnFocus: false,
  });

  const [ai, setAi] = useState<CloseDayResponse | null>(null);
  const [index, setIndex] = useState(0);
  const [asking, setAsking] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const touchX = useRef<number | null>(null);

  // Registrou algo no dia: o que falta mudou
  const lastKcal = useRef(eatenKcal);
  useEffect(() => {
    if (visible && lastKcal.current !== eatenKcal) {
      lastKcal.current = eatenKcal;
      setAi(null);
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

  const view = ai ?? data;
  const list = view.suggestions;
  const current = list[Math.min(index, list.length - 1)];
  const mealLabel = meal === 'SNACK' ? 'lanche' : 'jantar';
  const rem = data.remaining;
  const capped = data.target && data.target.kcal < rem.kcal;

  const go = (delta: number) => setIndex((i) => (i + delta + list.length) % list.length);

  function register(s: MealSuggestion) {
    sessionStorage.setItem(
      PREFILL_KEY,
      JSON.stringify({ date, type: meal as MealType, items: s.items.map(({ origin: _origin, ...item }) => item) }),
    );
    router.push(`/add?type=${meal}&date=${date}&prefill=1`);
  }

  async function askAi() {
    setAsking(true);
    try {
      const res = await api<CloseDayResponse>('/suggestions/close-day/ai', { method: 'POST', json: { date, meal } });
      if (res.suggestions.length === 0) {
        toast.show({ message: 'A IA não trouxe uma sugestão válida desta vez. Tente de novo.', tone: 'error' });
      } else {
        setAi(res);
        setIndex(0);
      }
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setAsking(false);
    }
  }

  return (
    <section className="card glass close-day stack" aria-label="Para fechar o dia">
      <div className="spread" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="headline">Para fechar o dia</h2>
          <p className="body-2 num">
            Faltam {fmtInt(rem.kcal)} kcal
            {rem.protein >= 5 && <> · {fmtInt(rem.protein)} g de proteína</>}
          </p>
          {capped && (
            <p className="caption">Uma refeição não precisa cobrir tudo: a sugestão mira até {fmtInt(data.target!.kcal)} kcal.</p>
          )}
        </div>
        {dismissButton}
      </div>

      {current ? (
        <div
          className="close-day-suggestion"
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchX.current === null || list.length < 2) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
          }}
        >
          <SuggestionView suggestion={current} />
          {list.length > 1 && (
            <div className="close-day-nav">
              <button type="button" className="btn btn-glass btn-icon" onClick={() => go(-1)} aria-label="Sugestão anterior">
                <ChevronLeft width={18} height={18} />
              </button>
              <span className="caption num" aria-live="polite">
                {Math.min(index, list.length - 1) + 1} de {list.length}
              </span>
              <button type="button" className="btn btn-glass btn-icon" onClick={() => go(1)} aria-label="Próxima sugestão">
                <ChevronRight width={18} height={18} />
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="body-2">Não encontramos uma boa combinação com a base local.</p>
      )}

      {current && (
        <div className="stack" style={{ gap: 10 }}>
          <button type="button" className="btn btn-primary btn-block" onClick={() => register(current)}>
            Registrar no {mealLabel}
          </button>
          {list.length > 1 && (
            <button type="button" className="btn btn-glass btn-block" onClick={() => setShowAll(true)}>
              Outras ideias
            </button>
          )}
        </div>
      )}

      {!ai && data.canAskAi && (
        <div className="stack" style={{ gap: 6 }}>
          <button type="button" className="btn btn-glass btn-block" onClick={askAi} disabled={asking}>
            {asking ? <span className="spinner" aria-label="Criando" /> : <SparkIcon width={20} height={20} />}
            {asking ? 'Criando' : 'Criar uma receita com IA'}
          </button>
          <p className="caption" style={{ textAlign: 'center' }}>
            {data.aiRemaining === 1 ? 'Resta 1 hoje' : `Restam ${data.aiRemaining} hoje`}
          </p>
        </div>
      )}

      <p className="caption close-day-disclaimer">Sugestões aproximadas, não substituem um nutricionista.</p>

      {showAll && (
        <Sheet open title="Outras ideias" onClose={() => setShowAll(false)}>
          <div className="stack-lg">
            <h2 className="title">Outras ideias</h2>
            {list.map((s, i) => (
              <div key={`${s.title}-${i}`} className="stack close-day-option">
                <SuggestionView suggestion={s} />
                <button type="button" className="btn btn-glass btn-block" onClick={() => register(s)}>
                  Registrar no {mealLabel}
                </button>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

function SuggestionView({ suggestion: s }: { suggestion: MealSuggestion }) {
  const badge = ORIGIN_BADGE[s.mainOrigin];
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="stack" style={{ gap: 4 }}>
        <span className={`badge ${badge.className}`} style={{ alignSelf: 'flex-start' }}>
          {badge.label}
        </span>
        <p className="headline">{s.title}</p>
      </div>
      <ul className="close-day-items">
        {s.items.map((item) => (
          <li key={item.name}>
            <span>
              <span className="num">{fmtInt(item.grams)} g</span> {item.name}
            </span>
            <span className="caption num">{fmtInt(item.kcal)} kcal</span>
          </li>
        ))}
      </ul>
      <p className="caption num">
        Total ≈ {fmtInt(s.totals.kcal)} kcal · P {fmtInt(s.totals.protein)} g · C {fmtInt(s.totals.carbs)} g · G{' '}
        {fmtInt(s.totals.fat)} g
      </p>
      {s.steps && s.steps.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          <p className="caption">
            Modo de preparo{s.minutes ? ` · cerca de ${s.minutes} min` : ''}
          </p>
          <ol className="close-day-steps">
            {s.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

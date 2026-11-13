'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/api';
import { addDays, dayTitle, isValidISO, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { useDay } from '@/lib/hooks';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { recipeToFood } from '@/lib/recipe';
import type { FoodResult, Meal, MealItem, MealType } from '@/lib/types';
import { useShortcuts } from '@/lib/useShortcuts';
import { FoodPortionSheet } from './FoodPortionSheet';
import { CloseDayCard } from './CloseDayCard';
import { ChevronLeft, ChevronRight, PlusIcon, PotIcon } from './Icons';
import { type DraftItem, toPayload } from './ItemsEditor';
import { ItemSheet } from './ItemSheet';
import { MacroDots, MacroLegend } from './MacroLegend';
import { RecipePickerSheet } from './RecipePickerSheet';
import { Rings } from './Rings';
import { ringSpecs } from './ringSpecs';

export function TodayView() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayISO();
  const param = params.get('date');
  const date = isValidISO(param) && param <= today ? param : today;

  const { data, error, isLoading, mutate } = useDay(date);
  const { mutate: globalMutate } = useSWRConfig();
  const [selected, setSelected] = useState<{ meal: Meal; item: MealItem } | null>(null);
  // "Da receita": primeiro escolhe a receita, depois a porção (já com a refeição e a data do card)
  const [recipeFor, setRecipeFor] = useState<MealType | null>(null);
  const [portion, setPortion] = useState<{ type: MealType; food: FoodResult } | null>(null);
  const cardContext = (type: MealType) => `${MEAL_LABEL[type]} · ${dayTitle(date)}`;

  async function logRecipe(type: MealType, item: DraftItem) {
    await api('/meals', { method: 'POST', json: { date, type, source: 'SEARCH', items: [toPayload(item)] } });
    await mutate();
    void globalMutate('/recipes'); // a contagem de uso ("mais usadas") mudou
    setPortion(null);
  }

  const go = (d: string) => router.replace(d === today ? '/' : `/?date=${d}`, { scroll: false });

  // Desktop: ← e → trocam o dia (só com mouse/trackpad e fora de campos de texto)
  useShortcuts({
    ArrowLeft: () => go(addDays(date, -1)),
    ArrowRight: () => date < today && go(addDays(date, 1)),
  });

  const targets = data?.targets;
  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  const remaining = targets ? targets.kcal - totals.kcal : 0;

  return (
    <main className="screen today-screen">
      {/* Colunas do desktop; no celular os wrappers usam display: contents e não mudam nada */}
      <div className="today-aside">
        <header className="header">
          <div>
            <p className="caption">{date === today ? 'Seu dia' : 'Revendo'}</p>
            <h1 className="large-title">{dayTitle(date)}</h1>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-glass btn-icon" onClick={() => go(addDays(date, -1))} aria-label="Dia anterior">
              <ChevronLeft width={20} height={20} />
            </button>
            <button
              className="btn btn-glass btn-icon"
              onClick={() => go(addDays(date, 1))}
              disabled={date >= today}
              aria-label="Próximo dia"
            >
              <ChevronRight width={20} height={20} />
            </button>
          </div>
        </header>

        {error && (
          <p className="alert" role="alert">
            {error.message}
          </p>
        )}

        <section className="card glass" aria-label="Resumo do dia">
          {targets ? (
            <>
              <div className="rings-card">
                <Rings rings={ringSpecs(totals, targets)} size={212} stroke={20} gap={5} />
                <MacroLegend totals={totals} targets={targets} />
              </div>
              <div className="remaining">
                <span className="body-2">{remaining >= 0 ? 'Ainda cabem' : 'Acima da meta'}</span>
                <span className="title num" style={{ color: remaining < 0 ? 'var(--ring-kcal)' : undefined }}>
                  {fmtInt(Math.abs(remaining))} kcal
                </span>
              </div>
            </>
          ) : (
            <div className="rings-card">
              <div
                className="skeleton"
                style={{ width: 'var(--rings-size, 212px)', height: 'var(--rings-size, 212px)', borderRadius: '50%' }}
              />
              <div className="legend">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="skeleton" style={{ height: 42 }} />
                ))}
              </div>
            </div>
          )}
        </section>

        {targets && <CloseDayCard date={date} isToday={date === today} eatenKcal={totals.kcal} />}
      </div>

      <div className="today-main">
        <h2 className="section-title">Refeições</h2>

        <div className="meal-grid">
          {MEAL_ORDER.map((type) => {
            const meals = data?.meals.filter((m) => m.type === type) ?? [];
            const kcal = meals.reduce((s, m) => s + m.totals.kcal, 0);
            return (
              <section key={type} className="card glass" aria-label={MEAL_LABEL[type]}>
                <div className="meal-head">
                  <h3 className="headline">{MEAL_LABEL[type]}</h3>
                  {meals.length > 0 && <span className="list-row-end">{fmtInt(kcal)} kcal</span>}
                </div>

                {isLoading && !data ? (
                  <div className="skeleton" style={{ height: 40 }} />
                ) : meals.length === 0 ? (
                  <div className="empty-actions">
                    <Link href={`/add?type=${type}&date=${date}`} className="empty-add">
                      <PlusIcon width={18} height={18} />
                      Adicionar
                    </Link>
                    <button type="button" className="empty-add" onClick={() => setRecipeFor(type)}>
                      <PotIcon width={18} height={18} />
                      Da receita
                    </button>
                  </div>
                ) : (
                  <div className="list">
                    {meals.flatMap((meal) =>
                      meal.items.map((item) => (
                        <button
                          key={item.id}
                          className="list-row"
                          onClick={() => setSelected({ meal, item })}
                        >
                          <span className="list-row-main">
                            <span className="list-row-title" style={{ display: 'block' }}>
                              {item.name}
                            </span>
                            <span className="list-row-sub">
                              {item.grams > 0 && <span style={{ marginRight: 10 }}>{fmtInt(item.grams)} g</span>}
                              <MacroDots m={item} />
                            </span>
                          </span>
                          <span className="list-row-end">{fmtInt(item.kcal)}</span>
                        </button>
                      )),
                    )}
                    <Link href={`/add?type=${type}&date=${date}`} className="empty-add" style={{ marginTop: 6 }}>
                      <PlusIcon width={18} height={18} />
                      Adicionar mais
                    </Link>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      {recipeFor && (
        <RecipePickerSheet
          context={cardContext(recipeFor)}
          onClose={() => setRecipeFor(null)}
          onPick={(recipe) => {
            setPortion({ type: recipeFor, food: recipeToFood(recipe) });
            setRecipeFor(null);
          }}
        />
      )}

      {portion && (
        <FoodPortionSheet
          key={portion.food.id}
          food={portion.food}
          context={cardContext(portion.type)}
          actionLabel="Registrar"
          onClose={() => setPortion(null)}
          onAdd={(item) => logRecipe(portion.type, item)}
        />
      )}

      <ItemSheet
        meal={selected?.meal ?? null}
        item={selected?.item ?? null}
        onClose={() => setSelected(null)}
        onChanged={() => void mutate()}
      />
    </main>
  );
}

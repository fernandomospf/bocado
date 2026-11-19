'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type TouchEvent, useCallback, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api } from '@/lib/api';
import { addDays, dayTitle, isValidISO, todayISO } from '@/lib/date';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { useDay, useLastWorkout, useMe, useProfile, useWeekStartsOn } from '@/lib/hooks';
import { activitiesSummary, mealsSummary } from '@/lib/movement';
import { useHomeSections } from '@/lib/useHomeSections';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { MEAL_LABEL, MEAL_ORDER } from '@/lib/labels';
import { useQuickMeals } from '@/lib/quickMeals';
import { useSharedSave } from '@/lib/sharedMeals';
import { recipeToFood } from '@/lib/recipe';
import type { FoodResult, Meal, MealItem, MealType } from '@/lib/types';
import { useShortcuts } from '@/lib/useShortcuts';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { Kcal } from './Kcal';
import { ConsistencyCard } from './ConsistencyCard';
import { FoodPortionSheet } from './FoodPortionSheet';
import { CloseDayCard } from './CloseDayCard';
import { CollapsibleSection } from './CollapsibleSection';
import { PlusIcon, PotIcon, RepeatIcon } from './Icons';
import { type DraftItem, toMealPayload } from './ItemsEditor';
import { ItemSheet } from './ItemSheet';
import { MacroDots } from './MacroLegend';
import { RecipePickerSheet } from './RecipePickerSheet';
import { OfferCards } from './OfferCards';
import type { SplitState } from './SplitPicker';
import { GaugeCluster } from './GaugeCluster';
import { Glp1Home } from './Glp1';
import { ReturnCard } from './ReturnCard';
import { FastingLine } from './Fasting';
import { SupplementsSection, useSupplementsToday } from './SupplementsSection';
import { useQuickSheets } from './QuickSheets';
import { DayPills } from './DayPills';
import { WeeklyCard } from './WeeklyCard';
import { WorkoutLine } from './WorkoutLine';

/** Distância mínima (px) do arraste horizontal que troca de dia. */
const SWIPE_MIN = 60;

/** Toques que começam em campos, em áreas com rolagem horizontal própria ou marcadas com data-no-swipe não trocam de dia. */
function ignoresSwipe(target: EventTarget | null) {
  let el = target instanceof Element ? target : null;
  if (el?.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe]')) return true;
  for (; el && el !== document.body; el = el.parentElement) {
    const overflow = getComputedStyle(el).overflowX;
    if ((overflow === 'auto' || overflow === 'scroll') && el.scrollWidth > el.clientWidth) return true;
  }
  return false;
}

export function TodayView() {
  const router = useRouter();
  const params = useSearchParams();
  const today = todayISO();
  const param = params.get('date');
  const date = isValidISO(param) && param <= today ? param : today;
  const weekStartsOn = useWeekStartsOn();
  const { hideCalories: hide } = useDisplayPrefs();
  // Direção da última troca de dia: define de que lado o conteúdo entra (null = sem animação)
  const [slide, setSlide] = useState<'prev' | 'next' | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const { data, error, isLoading, mutate } = useDay(date);
  // O dia anterior (em cache do SWR) alimenta o "Repetir ontem" dos cards vazios
  const { data: yesterday } = useDay(addDays(date, -1));
  const quick = useQuickMeals();
  const [repeating, setRepeating] = useState<MealType | null>(null);
  const { mutate: globalMutate } = useSWRConfig();
  const [selected, setSelected] = useState<{ meal: Meal; item: MealItem } | null>(null);
  // "Da receita": primeiro escolhe a receita, depois a porção (já com a refeição e a data do card)
  const [recipeFor, setRecipeFor] = useState<MealType | null>(null);
  const [portion, setPortion] = useState<{ type: MealType; food: FoodResult } | null>(null);
  const { data: me } = useMe();
  const glp1 = useProfile().data?.glp1Mode === true;
  const workouts = data?.workouts ?? [];
  const supp = useSupplementsToday(date);
  const sections = useHomeSections(me?.id, { hasWorkouts: workouts.length > 0, hasPendingSupplements: supp.pending });
  const [suggestionReady, setSuggestionReady] = useState(false);
  const onSuggestion = useCallback((v: boolean) => setSuggestionReady(v), []);
  const { openWorkout, openMovement } = useQuickSheets();
  const { data: lastWorkout } = useLastWorkout();
  const workoutActions = useWorkoutActions();
  const cardContext = (type: MealType) => `${MEAL_LABEL[type]} · ${dayTitle(date)}`;

  const saveShared = useSharedSave();

  async function logRecipe(type: MealType, item: DraftItem, split?: SplitState) {
    if (split) {
      await saveShared({ date, type, source: 'SEARCH', items: [toMealPayload(item)], shares: split.shares });
      await mutate();
      setPortion(null);
      return;
    }
    const meal = await api<Meal>('/meals', {
      method: 'POST',
      json: { date, type, source: 'SEARCH', items: [toMealPayload(item)] },
    });
    await mutate();
    void globalMutate('/recipes'); // a contagem de uso ("mais usadas") mudou
    setPortion(null);
    await quick.announce(meal, `${item.name} adicionado em ${MEAL_LABEL[type]}`);
  }

  /** A refeição do mesmo tipo no dia anterior, se tiver alimentos. */
  const yesterdayMeal = (type: MealType) => yesterday?.meals.find((m) => m.type === type && m.items.length > 0);

  async function repeatYesterday(type: MealType, meal: Meal) {
    if (repeating) return;
    setRepeating(type);
    try {
      await quick.repeat(meal.id, date, type);
      await mutate();
    } finally {
      setRepeating(null);
    }
  }

  const go = (d: string) => {
    if (d === date || d > today) return;
    setSlide(d < date ? 'prev' : 'next');
    router.replace(d === today ? '/' : `/?date=${d}`, { scroll: false });
  };

  function onTouchStart(e: TouchEvent) {
    touchStart.current =
      e.touches.length === 1 && !ignoresSwipe(e.target) ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStart.current;
    touchStart.current = null;
    // Eventos de Sheets (portal) também sobem até aqui pela árvore do React: com um diálogo aberto, nada de trocar o dia
    if (!start || document.querySelector('[aria-modal="true"]')) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) <= Math.abs(dy)) return;
    const next = addDays(date, dx > 0 ? -1 : 1);
    if (next > today) return;
    tap();
    go(next);
  }

  // Desktop: ← e → trocam o dia (só com mouse/trackpad e fora de campos de texto)
  useShortcuts({
    ArrowLeft: () => go(addDays(date, -1)),
    ArrowRight: () => date < today && go(addDays(date, 1)),
  });

  const targets = data?.targets;
  const totals = data?.totals ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <main
      className="screen today-screen"
      data-slide={slide ?? undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={() => (touchStart.current = null)}
    >
      {/* Colunas do desktop; no celular os wrappers usam display: contents e não mudam nada */}
      <div className="today-aside">
        <header className="header">
          <div>
            <p className="caption">{date === today ? 'Seu dia' : 'Revendo'}</p>
            <h1 className="large-title">{dayTitle(date)}</h1>
          </div>
        </header>

        <DayPills date={date} today={today} weekStartsOn={weekStartsOn} onSelect={go} />

        {error && (
          <p className="alert" role="alert">
            {error.message}
          </p>
        )}

        {date === today && <ReturnCard date={date} />}

        {/* key por dia: o bloco remonta e entra deslizando do lado da troca */}
        <section key={date} className="card glass day-slide gauge-card" aria-label="Resumo do dia">
          <GaugeCluster
            date={date}
            targets={targets ?? undefined}
            totals={totals}
            meals={data?.meals ?? []}
            hideCalories={hide}
            movement={data?.movement}
            isToday={date === today}
          />
          {/* Soma do treino ligada: a meta base e o bônus aparecem separados */}
          {!hide && data?.goalBonusKcal ? (
            <p className="caption num" style={{ textAlign: 'center' }}>
              Meta do dia: {fmtInt(data.baseTargetKcal ?? 0)} + {fmtInt(data.goalBonusKcal)} do treino
            </p>
          ) : null}
        </section>

        {date === today && <FastingLine />}

        <Glp1Home date={date} />

        <OfferCards />

        {hide && <ConsistencyCard today={today} />}

        <WeeklyCard today={today} isToday={date === today} />
      </div>

      <div className="today-main">
        <CollapsibleSection
          title="Refeições"
          summary={mealsSummary({
            items: data?.meals.reduce((s, m) => s + m.items.length, 0) ?? 0,
            kcal: totals.kcal,
            protein: totals.protein,
            hideCalories: hide,
          })}
          badge={
            !sections.mealsOpen && suggestionReady ? (
              <span className="collapsible-badge">
                <span className="collapsible-dot" aria-hidden />
                Sugestão
              </span>
            ) : null
          }
          open={sections.mealsOpen}
          onToggle={(open) => sections.toggle('meals', open)}
        >
          {data && data.meals.length === 0 && <p className="caption">Nada registrado neste dia</p>}

          <div className="meal-grid">
            {MEAL_ORDER.map((type) => {
              const meals = data?.meals.filter((m) => m.type === type) ?? [];
              const kcal = meals.reduce((s, m) => s + m.totals.kcal, 0);
              const protein = meals.reduce((s, m) => s + m.totals.protein, 0);
              return (
                <section key={`${type}-${date}`} className="card glass day-slide" aria-label={MEAL_LABEL[type]}>
                  <div className="meal-head">
                    <h3 className="headline">{MEAL_LABEL[type]}</h3>
                    {meals.length > 0 &&
                      (hide ? (
                        <span className="list-row-end num">{fmtInt(protein)} g de proteína</span>
                      ) : (
                        <span className="list-row-end">
                          <Kcal value={kcal} />
                        </span>
                      ))}
                  </div>

                  {isLoading && !data ? (
                    <div className="skeleton" style={{ height: 40 }} />
                  ) : meals.length === 0 ? (
                    <div className="empty-actions">
                      {(() => {
                        const prev = yesterdayMeal(type);
                        return prev ? (
                          <button
                            type="button"
                            className="empty-add"
                            onClick={() => void repeatYesterday(type, prev)}
                            disabled={repeating !== null}
                          >
                            <RepeatIcon width={18} height={18} />
                            Repetir ontem{hide ? ` · ${fmtInt(prev.totals.protein)} g de proteína` : ` · ${fmtInt(prev.totals.kcal)} kcal`}
                          </button>
                        ) : null;
                      })()}
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
                      {meals.map((meal) => <SharedBadge key={`badge-${meal.id}`} meal={meal} />)}
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
                                {/* Só o selo aqui (a linha inteira já é um botão); a explicação fica na ItemSheet */}
                                {item.estimated && <span className="badge badge-estimate badge-inline">estimativa</span>}
                              </span>
                            </span>
                            <span className="list-row-end">{hide ? `${fmtInt(item.protein)} g` : fmtInt(item.kcal)}</span>
                          </button>
                        )),
                      )}
                      <div className="empty-actions" style={{ marginTop: 6 }}>
                        <Link href={`/add?type=${type}&date=${date}`} className="empty-add">
                          <PlusIcon width={18} height={18} />
                          Adicionar mais
                        </Link>
                        <button type="button" className="empty-add" onClick={() => setRecipeFor(type)}>
                          <PotIcon width={18} height={18} />
                          Da receita
                        </button>
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          {/* Depois do Jantar, como último bloco das refeições (no desktop, no fim da coluna das refeições) */}
          {targets && !glp1 && (
            <CloseDayCard
              date={date}
              isToday={date === today}
              eatenKcal={totals.kcal}
              dinnerLogged={data?.meals.some((m) => m.type === 'DINNER' && m.items.length > 0) ?? false}
              onAvailability={onSuggestion}
            />
          )}
        </CollapsibleSection>

        <CollapsibleSection
          title="Atividades"
          summary={activitiesSummary({ workouts, hideCalories: hide, isToday: date === today })}
          open={sections.activitiesOpen}
          onToggle={(open) => sections.toggle('activities', open)}
          className="activities-section"
        >
          <WorkoutLine date={date} workouts={workouts} />
          <div className="empty-actions">
            <button type="button" className="empty-add" onClick={() => openWorkout({ date })}>
              <PlusIcon width={18} height={18} />
              Registrar treino
            </button>
            {lastWorkout && (
              <button type="button" className="empty-add" onClick={() => void workoutActions.repeat(lastWorkout.id, date)}>
                <RepeatIcon width={18} height={18} />
                Repetir último treino
              </button>
            )}
          </div>
          <button type="button" className="text-link activities-week-link" onClick={() => openMovement(date)}>
            Ver movimento da semana
          </button>
        </CollapsibleSection>

        {/* Só com o módulo ativo e ao menos um item ativo (dado sensível: nada aparece antes disso) */}
        <SupplementsSection date={date} supp={supp} open={sections.supplementsOpen} onToggle={(open) => sections.toggle('supplements', open)} />
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
          onClose={() => setPortion(null)}
          splittable
          onAdd={(item, split) => logRecipe(portion.type, item, split)}
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

/** "Compartilhada por Ana" (ou só "Compartilhada") em refeição recebida; "Dividida com Ana" na enviada. */
function SharedBadge({ meal }: { meal: Meal }) {
  if (!meal.shared) return null;
  const first = (n: string) => n.trim().split(/\s+/)[0];
  const label = meal.sharedBy
    ? `Compartilhada por ${first(meal.sharedBy.name)}`
    : meal.splitWith && meal.splitWith.length > 0
      ? `Dividida com ${meal.splitWith.map((p) => first(p.name)).join(', ')}`
      : meal.splitWith
        ? 'Dividida'
        : 'Compartilhada';
  return (
    <p className="caption" style={{ padding: '0 2px 8px' }}>
      <span className="badge badge-origin-recipe">{label}</span>
    </p>
  );
}

'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import useSWR from 'swr';
import { fmtInt } from '@/lib/format';
import { useFavorites, useRecentMeals } from '@/lib/hooks';
import { quickKey, quickLabel } from '@/lib/quickMeals';
import type { MealType, QuickItem, RecipeSummary } from '@/lib/types';
import { CheckIcon, PlusIcon, PotIcon } from './Icons';

/** Quantas receitas, favoritas e recentes aparecem na faixa; o resto fica em "Ver todas" / no Perfil. */
const MAX_RECIPES = 8;
const MAX_FAVORITES = 10;

export type QuickSource = { kind: 'favorite' | 'recent'; id: string };

interface QuickChipsProps {
  /** Refeição selecionada na tela: os recentes desse tipo vêm primeiro. */
  type: MealType;
  onPickRecipe: (recipe: RecipeSummary) => void;
  /** Tocar no chip: os itens entram no editor, ainda editáveis. */
  onPickItems: (items: QuickItem[]) => void;
  /** "Registrar direto": salva na hora. */
  onRegister: (source: QuickSource) => void;
  disabled?: boolean;
}

/** Faixa horizontal de atalhos no topo da Nova refeição: Favoritas, Recentes e Receitas. */
export function QuickChips({ type, onPickRecipe, onPickItems, onRegister, disabled }: QuickChipsProps) {
  const { data: recipes } = useSWR<RecipeSummary[]>('/recipes');
  const { data: favorites } = useFavorites();
  const { data: recent } = useRecentMeals(type);

  // Recente que já é favorita não aparece duas vezes
  const recents = useMemo(() => {
    const favKeys = new Set((favorites ?? []).map((f) => quickKey(f.items)));
    return (recent ?? []).filter((r) => !favKeys.has(quickKey(r.items)));
  }, [favorites, recent]);

  if (!recipes && !favorites && !recent) return null;

  return (
    <nav className="chip-strip" aria-label="Atalhos">
      {favorites && favorites.length > 0 && (
        <>
          <span className="chip-group-label">Favoritas</span>
          {favorites.slice(0, MAX_FAVORITES).map((f) => (
            <MealChip
              key={f.id}
              label={f.name}
              kcal={f.totals.kcal}
              disabled={disabled}
              onPick={() => onPickItems(f.items)}
              onRegister={() => onRegister({ kind: 'favorite', id: f.id })}
            />
          ))}
          {favorites.length > MAX_FAVORITES && (
            <Link href="/profile" className="chip chip-plain">
              Ver todas
            </Link>
          )}
        </>
      )}

      {recents.length > 0 && (
        <>
          <span className="chip-group-label">Recentes</span>
          {recents.map((r) => (
            <MealChip
              key={r.mealId}
              label={quickLabel(r.items)}
              kcal={r.totals.kcal}
              times={r.times}
              disabled={disabled}
              onPick={() => onPickItems(r.items)}
              onRegister={() => onRegister({ kind: 'recent', id: r.mealId })}
            />
          ))}
        </>
      )}

      {recipes && (
        <>
          <span className="chip-group-label">
            <PotIcon width={16} height={16} />
            Receitas
          </span>
          {recipes.length === 0 ? (
            <Link href="/recipes/new" className="chip">
              <PlusIcon width={16} height={16} />
              Criar receita
            </Link>
          ) : (
            <>
              {recipes.slice(0, MAX_RECIPES).map((r) => (
                <button key={r.id} type="button" className="chip" onClick={() => onPickRecipe(r)}>
                  {r.name}
                </button>
              ))}
              <Link href="/recipes" className="chip chip-plain">
                Ver todas
              </Link>
            </>
          )}
        </>
      )}
    </nav>
  );
}

/** Chip de refeição: o corpo adiciona ao editor; o botão ✓ registra direto. Alvos de 44px. */
function MealChip({
  label,
  kcal,
  times,
  disabled,
  onPick,
  onRegister,
}: {
  label: string;
  kcal: number;
  times?: number;
  disabled?: boolean;
  onPick: () => void;
  onRegister: () => void;
}) {
  return (
    <span className="chip-meal">
      <button type="button" className="chip-meal-main" onClick={onPick} disabled={disabled}>
        <span className="chip-meal-label">{label}</span>
        <span className="chip-meal-kcal num">{fmtInt(kcal)} kcal</span>
        {times && times > 1 && <span className="chip-count num" aria-label={`${times} vezes`}>{times}x</span>}
      </button>
      <button
        type="button"
        className="chip-meal-go"
        onClick={onRegister}
        disabled={disabled}
        aria-label={`Registrar direto: ${label}`}
        title="Registrar direto"
      >
        <CheckIcon width={18} height={18} />
      </button>
    </span>
  );
}

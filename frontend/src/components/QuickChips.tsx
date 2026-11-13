'use client';

import Link from 'next/link';
import useSWR from 'swr';
import type { RecipeSummary } from '@/lib/types';
import { PlusIcon, PotIcon } from './Icons';

/** Quantas receitas aparecem na faixa (as mais usadas); o resto fica em "Ver todas". */
const MAX_RECIPES = 8;

/**
 * Faixa horizontal de atalhos no topo da Nova refeição.
 * Hoje tem o grupo Receitas; Favoritas e Recentes entram aqui quando existirem no backend.
 */
export function QuickChips({ onPickRecipe }: { onPickRecipe: (recipe: RecipeSummary) => void }) {
  const { data: recipes } = useSWR<RecipeSummary[]>('/recipes');
  if (!recipes) return null;

  return (
    <nav className="chip-strip" aria-label="Atalhos">
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
    </nav>
  );
}

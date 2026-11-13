'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { matchesName, recipeSubtitle } from '@/lib/recipe';
import type { RecipeSummary } from '@/lib/types';
import { ChevronRight } from './Icons';
import { Sheet } from './Sheet';

/** Acima disso a lista ganha um campo de filtro. */
const FILTER_FROM = 7;

interface RecipePickerSheetProps {
  /** Onde a receita vai entrar, ex.: "Almoço · Hoje". */
  context: string;
  onClose: () => void;
  onPick: (recipe: RecipeSummary) => void;
}

/** Escolha de uma receita (as mais usadas primeiro, como vêm da API). */
export function RecipePickerSheet({ context, onClose, onPick }: RecipePickerSheetProps) {
  const { data, error, isLoading } = useSWR<RecipeSummary[]>('/recipes');
  const [query, setQuery] = useState('');
  const recipes = (data ?? []).filter((r) => matchesName(r.name, query));

  return (
    <Sheet open title="Da receita" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="title">Da receita</h2>
          <p className="caption">{context}</p>
        </div>

        {(data?.length ?? 0) >= FILTER_FROM && (
          <input
            className="input"
            type="search"
            placeholder="Filtrar receitas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Filtrar receitas"
          />
        )}

        {error && (
          <p className="alert" role="alert">
            {error.message}
          </p>
        )}

        {isLoading && !data && <div className="skeleton" style={{ height: 52 }} />}

        {data && data.length === 0 && (
          <div className="stack" style={{ textAlign: 'center' }}>
            <p className="body-2">Você ainda não tem receitas. Cadastre uma vez e registre sem precisar da IA.</p>
            <Link href="/recipes/new" className="btn btn-primary btn-block" onClick={onClose}>
              Nova receita
            </Link>
          </div>
        )}

        {recipes.length > 0 && (
          <div className="list">
            {recipes.map((r) => (
              <button key={r.id} type="button" className="list-row" onClick={() => onPick(r)}>
                <span className="list-row-main">
                  <span className="list-row-title" style={{ display: 'block' }}>
                    {r.name}
                  </span>
                  <span className="list-row-sub">
                    {recipeSubtitle(r)}
                    {r.timesUsed > 0 && ` · ${r.timesUsed}×`}
                  </span>
                </span>
                <ChevronRight width={16} height={16} aria-hidden />
              </button>
            ))}
          </div>
        )}

        {data && data.length > 0 && recipes.length === 0 && (
          <p className="caption" style={{ textAlign: 'center' }}>
            Nenhuma receita com esse nome.
          </p>
        )}
      </div>
    </Sheet>
  );
}

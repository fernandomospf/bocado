'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { matchesName, recipeSubtitle } from '@/lib/recipe';
import type { RecipeSummary } from '@/lib/types';
import { ChevronRight, PlusIcon } from './Icons';

/** Aba Receitas: lista (as mais usadas primeiro), busca por nome e criação. */
export function RecipesListView() {
  const { data, error } = useSWR<RecipeSummary[]>('/recipes');
  const [query, setQuery] = useState('');
  const recipes = (data ?? []).filter((r) => matchesName(r.name, query));

  return (
    <main className="screen screen-narrow">
      <header className="header">
        <h1 className="large-title">Receitas</h1>
      </header>

      <Link href="/recipes/new" className="btn btn-primary btn-block">
        <PlusIcon width={20} height={20} />
        Nova receita
      </Link>

      {data && data.length > 0 && (
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          placeholder="Buscar receita pelo nome"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar receita pelo nome"
        />
      )}

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}

      {data && data.length === 0 && (
        <section className="card glass stack" style={{ textAlign: 'center' }}>
          <p className="headline">Cadastre uma vez, registre sempre</p>
          <p className="body-2">
            Monte a receita com os ingredientes crus e o peso final da panela. Depois, é só escolher a porção, sem precisar
            da IA.
          </p>
        </section>
      )}

      {recipes.length > 0 && (
        <section className="card glass" style={{ paddingTop: 6, paddingBottom: 6 }}>
          <div className="list">
            {recipes.map((r) => (
              <Link key={r.id} href={`/recipes/${r.id}`} className="list-row">
                <div className="list-row-main">
                  <div className="list-row-title">{r.name}</div>
                  <div className="list-row-sub">
                    {recipeSubtitle(r)}
                    {r.timesUsed > 0 && ` · usada ${r.timesUsed}×`}
                  </div>
                </div>
                {r.shared && <span className="badge badge-origin-recipe">{r.isOwner ? 'Na casa' : 'Da casa'}</span>}
                <ChevronRight width={16} height={16} aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}

      {data && data.length > 0 && recipes.length === 0 && (
        <p className="caption" style={{ textAlign: 'center' }}>
          Nenhuma receita com esse nome.
        </p>
      )}
    </main>
  );
}

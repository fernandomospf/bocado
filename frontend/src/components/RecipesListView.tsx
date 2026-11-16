'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { fmtInt } from '@/lib/format';
import { matchesName } from '@/lib/recipe';
import type { RecipeSummary } from '@/lib/types';
import { ChevronRight, PlusIcon } from './Icons';

/** Aba Receitas: lista (as mais usadas primeiro), busca por nome e criação. */
export function RecipesListView() {
  const { data, error } = useSWR<RecipeSummary[]>('/recipes');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'used' | 'recent' | 'az'>('used');
  const recipes = useMemo(() => {
    const list = (data ?? []).filter((r) => matchesName(r.name, query));
    const byName = (a: RecipeSummary, b: RecipeSummary) => a.name.localeCompare(b.name, 'pt-BR');
    const byRecent = (a: RecipeSummary, b: RecipeSummary) => b.updatedAt.localeCompare(a.updatedAt);
    if (sort === 'az') return list.sort(byName);
    if (sort === 'recent') return list.sort(byRecent);
    return list.sort((a, b) => b.timesUsed - a.timesUsed || byRecent(a, b));
  }, [data, query, sort]);

  return (
    <main className="screen screen-narrow">
      <header className="header">
        <h1 className="large-title">Receitas</h1>
      </header>

      <Link href="/recipes/new" className="btn btn-primary btn-block">
        <PlusIcon width={20} height={20} />
        Nova receita
      </Link>

      {data && data.length > 1 && (
        <div className="segmented" role="group" aria-label="Ordenar receitas">
          {(
            [
              ['used', 'Mais usadas'],
              ['recent', 'Recentes'],
              ['az', 'A–Z'],
            ] as const
          ).map(([key, label]) => (
            <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)}>
              {label}
            </button>
          ))}
        </div>
      )}

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
          <Link href="/recipes/new" className="btn btn-primary btn-block">
            Criar primeira receita
          </Link>
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
                    {r.portionGrams && (
                      <span className="num">{fmtInt((r.per100.kcal * r.portionGrams) / 100)} kcal/porção · </span>
                    )}
                    <span className="num">{fmtInt(r.per100.kcal)} kcal/100 g</span>
                    {r.timesUsed > 0 && ` · usada ${r.timesUsed}x`}
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

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { fmtInt } from '@/lib/format';
import type { RecipeSummary } from '@/lib/types';
import { ChevronLeft, ChevronRight, PlusIcon } from './Icons';

/** "1 porção (325 g) · 491 kcal" ou "100 g · 151 kcal". */
function recipeSubtitle(r: RecipeSummary) {
  if (r.portionGrams) {
    return `1 porção (${fmtInt(r.portionGrams)} g) · ${fmtInt((r.per100.kcal * r.portionGrams) / 100)} kcal`;
  }
  return `100 g · ${fmtInt(r.per100.kcal)} kcal`;
}

export function RecipesListView() {
  const router = useRouter();
  const { data, error } = useSWR<RecipeSummary[]>('/recipes');

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <button className="btn btn-glass btn-icon" onClick={() => router.back()} aria-label="Voltar">
          <ChevronLeft width={20} height={20} />
        </button>
        <h1 className="headline">Minhas receitas</h1>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      <Link href="/recipes/new" className="btn btn-primary btn-block">
        <PlusIcon width={20} height={20} />
        Nova receita
      </Link>

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}

      {data && data.length === 0 && (
        <section className="card glass stack" style={{ textAlign: 'center' }}>
          <p className="headline">Cadastre uma vez, registre sempre</p>
          <p className="body-2">
            Monte a receita com os ingredientes crus e o peso final da panela. Depois, é só buscar pelo nome e escolher a
            porção, sem precisar da IA.
          </p>
        </section>
      )}

      {data && data.length > 0 && (
        <section className="card glass" style={{ paddingTop: 6, paddingBottom: 6 }}>
          <div className="list">
            {data.map((r) => (
              <Link key={r.id} href={`/recipes/${r.id}`} className="list-row">
                <div className="list-row-main">
                  <div className="list-row-title">{r.name}</div>
                  <div className="list-row-sub">
                    {recipeSubtitle(r)} · {r.ingredientCount} {r.ingredientCount === 1 ? 'ingrediente' : 'ingredientes'}
                  </div>
                </div>
                {r.shared && <span className="badge badge-origin-recipe">{r.isOwner ? 'Na casa' : 'Da casa'}</span>}
                <ChevronRight width={16} height={16} aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

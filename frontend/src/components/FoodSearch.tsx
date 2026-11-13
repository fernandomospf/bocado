'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fmtInt } from '@/lib/format';
import type { FoodResult } from '@/lib/types';
import { FoodPortionSheet, ORIGIN_LABEL } from './FoodPortionSheet';
import { type DraftItem } from './ItemsEditor';

const DEBOUNCE_MS = 250;

/** "1 unidade · 73 kcal" quando há porção; senão "100 g · 146 kcal". */
function portionSummary(food: FoodResult) {
  if (food.portion) {
    const kcal = (food.per100.kcal * food.portion.grams) / 100;
    const label = food.origin === 'history' ? `${fmtInt(food.portion.grams)} g da última vez` : food.portion.label;
    return `${label} · ${fmtInt(kcal)} kcal`;
  }
  return `100 g · ${fmtInt(food.per100.kcal)} kcal`;
}

/** Busca de alimentos (histórico, próprios e TACO) com escolha de porção. */
export function FoodSearch({ onAdd }: { onAdd: (item: DraftItem) => void }) {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [picked, setPicked] = useState<FoodResult | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, error, isLoading } = useSWR<FoodResult[]>(
    `/foods/search?q=${encodeURIComponent(debounced)}&limit=20`,
    { keepPreviousData: true, revalidateOnFocus: false },
  );

  const searching = debounced.length > 0;
  const results = data ?? [];

  return (
    <section className="stack">
      <label className="field">
        <span className="sr-only">Buscar alimento</span>
        <input
          className="input"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          placeholder="Buscar alimento: arroz, ovo, banana…"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      {error ? (
        <p className="alert" role="alert">
          {error.message}
        </p>
      ) : results.length > 0 ? (
        <div className="card glass" style={{ paddingTop: 6, paddingBottom: 6 }}>
          {!searching && <p className="caption" style={{ padding: '6px 0 2px' }}>Seus mais usados</p>}
          <div className="list" aria-busy={isLoading}>
            {results.map((food) => (
              <button
                key={`${food.origin}-${food.id ?? food.name}`}
                type="button"
                className="list-row"
                onClick={() => setPicked(food)}
              >
                <div className="list-row-main">
                  <div className="list-row-title">{food.name}</div>
                  <div className="list-row-sub">{portionSummary(food)}</div>
                </div>
                <span className={`badge badge-origin-${food.origin}`}>{ORIGIN_LABEL[food.origin]}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        !isLoading && (
          <p className="caption" style={{ textAlign: 'center', padding: '8px 12px' }}>
            {searching
              ? 'Nada encontrado. Tente outro nome, ou use Descrever para a IA estimar.'
              : 'Busque na Tabela TACO. O que você registrar aparece aqui para repetir rápido.'}
          </p>
        )
      )}

      {picked && (
        <FoodPortionSheet
          key={`${picked.origin}-${picked.id ?? picked.name}`}
          food={picked}
          onClose={() => setPicked(null)}
          onAdd={(item) => {
            onAdd(item);
            setPicked(null);
            setQuery('');
          }}
        />
      )}
    </section>
  );
}

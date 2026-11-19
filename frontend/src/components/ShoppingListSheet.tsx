'use client';

import { useMemo, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { saveFile } from '@/lib/saveFile';
import { fmtQty, itemKey, type ShoppingList, shoppingToCsv, shoppingToText } from '@/lib/shopping';
import type { RecipeSummary } from '@/lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const MAX_TIMES = 10;

/**
 * Lista de compras das receitas. Passo 1: escolher receitas e quantas vezes vai preparar cada uma (1 a 10).
 * Passo 2: a lista somada (sem IA), com "já tenho em casa" (só neste aparelho), copiar, compartilhar e CSV.
 */
export function ShoppingListSheet({ recipes, onClose }: { recipes: RecipeSummary[]; onClose: () => void }) {
  const toast = useToast();
  const [times, setTimes] = useState<Record<string, number>>({});
  const [list, setList] = useState<ShoppingList | null>(null);
  const [have, setHave] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const picked = Object.entries(times).filter(([, t]) => t > 0);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const text = useMemo(() => (list ? shoppingToText(list.groups, have) : ''), [list, have]);

  async function generate() {
    setBusy(true);
    try {
      setList(await api<ShoppingList>('/recipes/shopping-list', { method: 'POST', json: { items: picked.map(([recipeId, t]) => ({ recipeId, times: t })) } }));
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  function toggleHave(key: string) {
    setHave((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.show({ message: 'Lista copiada' });
    } catch {
      toast.show({ message: 'Não foi possível copiar. Use Compartilhar ou o CSV.', tone: 'error' });
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Lista de compras', text });
    } catch {
      // A pessoa fechou a folha de compartilhar: nada a fazer
    }
  }

  async function csv() {
    if (!list) return;
    try {
      await saveFile(new Blob([shoppingToCsv(list.groups)], { type: 'text/csv;charset=utf-8' }), 'bocado-lista-de-compras.csv');
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  return (
    <Sheet open title="Lista de compras" onClose={onClose}>
      {!list ? (
        <div className="stack-lg">
          <div>
            <h2 className="title">Lista de compras</h2>
            <p className="caption">Escolha as receitas e quantas vezes vai preparar cada uma.</p>
          </div>
          <ul className="list shopping-pick">
            {recipes.map((r) => {
              const t = times[r.id] ?? 0;
              return (
                <li key={r.id} className="list-row">
                  <span className="list-row-main">
                    <span className="list-row-title">{r.name}</span>
                  </span>
                  <span className="shopping-stepper" role="group" aria-label={`Vezes: ${r.name}`}>
                    <button type="button" className="btn btn-glass btn-icon" aria-label={`Menos uma vez: ${r.name}`} disabled={t <= 0} onClick={() => setTimes((p) => ({ ...p, [r.id]: Math.max(0, t - 1) }))}>
                      −
                    </button>
                    <output className="shopping-stepper-value num" aria-live="polite">{t}×</output>
                    <button type="button" className="btn btn-glass btn-icon" aria-label={`Mais uma vez: ${r.name}`} disabled={t >= MAX_TIMES} onClick={() => setTimes((p) => ({ ...p, [r.id]: t + 1 }))}>
                      +
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn btn-primary btn-block" disabled={busy || picked.length === 0} onClick={generate}>
            {busy ? <span className="spinner" aria-label="Montando" /> : `Montar a lista${picked.length ? ` (${picked.length})` : ''}`}
          </button>
        </div>
      ) : (
        <div className="stack-lg">
          <div>
            <h2 className="title">Lista de compras</h2>
            <p className="caption">{list.recipes.map((r) => `${r.name} ${r.times}×`).join(' · ')}</p>
          </div>
          {list.groups.map((g) => (
            <section key={g.category} className="stack-sm" aria-label={g.category}>
              <h3 className="field-label">{g.category}</h3>
              <ul className="list">
                {g.items.map((i) => {
                  const key = itemKey(g.category, i.name);
                  return (
                    <li key={key}>
                      <label className="check-row shopping-item" data-have={have.has(key) || undefined}>
                        <input type="checkbox" checked={have.has(key)} onChange={() => toggleHave(key)} aria-label={`Já tenho: ${i.name}`} />
                        <span className="list-row-main">{i.name}</span>
                        <span className="num">{fmtQty(i.grams)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="caption">Marque o que já tem em casa: fica só neste aparelho e sai da lista copiada.</p>
          <div className="grid-2">
            <button type="button" className="btn btn-glass" onClick={copy}>
              Copiar
            </button>
            {canShare && (
              <button type="button" className="btn btn-glass" onClick={share}>
                Compartilhar
              </button>
            )}
            <button type="button" className="btn btn-glass" onClick={csv}>
              Baixar CSV
            </button>
            <button type="button" className="btn btn-plain" onClick={() => setList(null)}>
              Mudar receitas
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

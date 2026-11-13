'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtDec, fmtInt, parseNum } from '@/lib/format';
import { computeRecipe } from '@/lib/recipe';
import type { RecipeDetail } from '@/lib/types';
import { FoodSearch } from './FoodSearch';
import { ChevronLeft, PlusIcon } from './Icons';
import { type DraftItem, draftFromValues, ItemsEditor, newDraft, toPayload } from './ItemsEditor';
import { MacroDots } from './MacroLegend';

const toText = (n: number | null | undefined) => (n ? String(n).replace('.', ',') : '');

/** Revalida tudo que mostra receitas: a lista e a busca de alimentos. */
const isRecipeKey = (key: unknown) =>
  typeof key === 'string' && (key.startsWith('/recipes') || key.startsWith('/foods/search'));

export function RecipeEditorView({ id }: { id: string }) {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const isNew = id === 'new';
  const { data, error: loadError } = useSWR<RecipeDetail>(isNew ? null : `/recipes/${id}`);

  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [cooked, setCooked] = useState('');
  const [servings, setServings] = useState('');
  const [items, setItems] = useState<DraftItem[]>([]);
  const [loaded, setLoaded] = useState(isNew);

  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preenche o formulário uma única vez, quando a receita chega
  useEffect(() => {
    if (!data || loaded) return;
    setName(data.name);
    setNotes(data.notes ?? '');
    setCooked(toText(data.totalCookedGrams));
    setServings(data.servings ? String(data.servings) : '');
    setItems(data.ingredients.map(draftFromValues));
    setLoaded(true);
  }, [data, loaded]);

  const readOnly = !!data && !data.isOwner;
  const cookedGrams = parseNum(cooked) > 0 ? Math.round(parseNum(cooked) * 10) / 10 : null;
  const servingsCount = Math.round(parseNum(servings)) > 0 ? Math.round(parseNum(servings)) : null;
  const ingredients = useMemo(() => items.filter((i) => i.name.trim()).map((i) => ({ ...toPayload(i), foodId: i.foodId })), [items]);
  const preview = useMemo(
    () => computeRecipe(ingredients, cookedGrams, servingsCount),
    [ingredients, cookedGrams, servingsCount],
  );
  const portion = preview.portionGrams
    ? {
        kcal: (preview.per100.kcal * preview.portionGrams) / 100,
        protein: (preview.per100.protein * preview.portionGrams) / 100,
        carbs: (preview.per100.carbs * preview.portionGrams) / 100,
        fat: (preview.per100.fat * preview.portionGrams) / 100,
      }
    : null;

  function addIngredient(item: DraftItem) {
    setItems((prev) => [...prev, item]);
    setError(null);
  }

  async function save() {
    if (name.trim().length < 2) return setError('Dê um nome à receita.');
    if (ingredients.length === 0) return setError('Adicione pelo menos um ingrediente.');
    if (ingredients.some((i) => !(i.grams > 0))) return setError('Informe os gramas de cada ingrediente.');

    setBusy('save');
    setError(null);
    try {
      const body = {
        name: name.trim(),
        notes: notes.trim() || undefined,
        totalCookedGrams: cookedGrams,
        servings: servingsCount,
        ingredients: ingredients.map(({ foodId, ...i }) => (foodId ? { ...i, foodId } : i)),
      };
      await api(isNew ? '/recipes' : `/recipes/${id}`, { method: isNew ? 'POST' : 'PUT', json: body });
      await mutate(isRecipeKey);
      router.replace('/recipes');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy('delete');
    setError(null);
    try {
      await api(`/recipes/${id}`, { method: 'DELETE' });
      await mutate(isRecipeKey);
      router.replace('/recipes');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const title = isNew ? 'Nova receita' : readOnly ? 'Receita da casa' : 'Editar receita';

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <button className="btn btn-glass btn-icon" onClick={() => router.back()} aria-label="Voltar">
          <ChevronLeft width={20} height={20} />
        </button>
        <h1 className="headline">{title}</h1>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      {loadError && (
        <p className="alert" role="alert">
          {loadError.message}
        </p>
      )}

      {!loaded && !loadError && (
        <div className="splash" aria-busy="true" style={{ minHeight: 200 }}>
          <span className="spinner" aria-label="Carregando" />
        </div>
      )}

      {loaded && (
        <>
          {readOnly && <p className="note">Receita compartilhada pela casa. Só quem criou pode alterá-la.</p>}

          <section className="card glass stack">
            <label className="field">
              <span className="field-label">Nome</span>
              <input
                className="input"
                placeholder="Ex.: Feijão da vó"
                value={name}
                maxLength={120}
                disabled={readOnly}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Notas (opcional)</span>
              <textarea
                className="textarea"
                placeholder="Modo de preparo, variações…"
                value={notes}
                maxLength={1000}
                disabled={readOnly}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
          </section>

          <section className="stack" aria-label="Ingredientes">
            <div className="spread" style={{ padding: '0 4px' }}>
              <h2 className="section-title" style={{ padding: 0 }}>
                Ingredientes
              </h2>
              <span className="caption">Pesos crus</span>
            </div>
            {!readOnly && <FoodSearch onAdd={addIngredient} excludeRecipes placeholder="Adicionar ingrediente…" />}
            {items.length > 0 &&
              (readOnly ? (
                <div className="card glass" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  <div className="list">
                    {items.map((i) => (
                      <div key={i.key} className="list-row">
                        <span className="list-row-main">{i.name}</span>
                        <span className="list-row-end num">{i.grams} g</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <ItemsEditor items={items} onChange={setItems} />
              ))}
            {!readOnly && (
              <button type="button" className="btn btn-glass btn-block" onClick={() => addIngredient(newDraft())}>
                <PlusIcon width={20} height={20} />
                Adicionar manualmente
              </button>
            )}
          </section>

          <section className="card glass stack">
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Peso final da panela</span>
                <div className="input-suffix">
                  <input
                    className="input num"
                    inputMode="decimal"
                    placeholder={preview.rawGrams > 0 ? fmtInt(preview.rawGrams) : '0'}
                    value={cooked}
                    disabled={readOnly}
                    onChange={(e) => setCooked(e.target.value)}
                  />
                  <span>g</span>
                </div>
              </label>
              <label className="field">
                <span className="field-label">Rende quantas porções?</span>
                <input
                  className="input num"
                  inputMode="numeric"
                  placeholder="Opcional"
                  value={servings}
                  disabled={readOnly}
                  onChange={(e) => setServings(e.target.value.replace(/\D/g, ''))}
                />
              </label>
            </div>
            <p className="caption">
              Como pesar: coloque a panela vazia na balança e use a tara (ou anote o peso dela). Depois pese a panela com a
              comida pronta e desconte. Em branco, vale a soma dos ingredientes crus.
            </p>
            {preview.weightWarning && (
              <p className="note">
                Confira o peso final: cozimento costuma mudar o peso (arroz e feijão absorvem água; carnes perdem).
              </p>
            )}
          </section>

          {ingredients.length > 0 && (
            <section className="card glass stack" aria-live="polite">
              <div className="spread">
                <span className="body-2">Por 100 g</span>
                <span className="headline num">{fmtInt(preview.per100.kcal)} kcal</span>
              </div>
              <p className="caption">
                <MacroDots m={preview.per100} />
              </p>
              {portion && preview.portionGrams && (
                <>
                  <div className="spread">
                    <span className="body-2">Por porção ({fmtDec(preview.portionGrams)} g)</span>
                    <span className="headline num">{fmtInt(portion.kcal)} kcal</span>
                  </div>
                  <p className="caption">
                    <MacroDots m={portion} />
                  </p>
                </>
              )}
              <p className="caption">
                Receita inteira: {fmtInt(preview.totals.kcal)} kcal em {fmtInt(preview.baseGrams)} g
              </p>
            </section>
          )}

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          {!readOnly && (
            <div className="stack">
              <button className="btn btn-primary btn-block" onClick={save} disabled={!!busy}>
                {busy === 'save' ? <span className="spinner" aria-label="Salvando" /> : 'Salvar receita'}
              </button>
              {!isNew && (
                <button className="btn btn-glass btn-block btn-danger" onClick={remove} disabled={!!busy}>
                  {confirmDelete ? 'Toque de novo para excluir' : 'Excluir receita'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

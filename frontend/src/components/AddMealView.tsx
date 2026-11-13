'use client';

/* eslint-disable @next/next/no-img-element */
import { useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { isValidISO, todayISO } from '@/lib/date';
import { fmtInt, parseNum } from '@/lib/format';
import { compressImage } from '@/lib/image';
import { MEAL_ORDER, mealTypeForNow } from '@/lib/labels';
import type { AnalysisResult, MealSource, MealType } from '@/lib/types';
import { FoodSearch } from './FoodSearch';
import { MacroDots } from './MacroLegend';
import { CameraIcon, ChevronLeft, PlusIcon, SparkIcon } from './Icons';
import { type DraftItem, draftFromAnalysis, ItemsEditor, newDraft, resolveKcal, toPayload } from './ItemsEditor';

type Mode = 'search' | 'photo' | 'text' | 'manual';

const MODES: { value: Mode; label: string }[] = [
  { value: 'search', label: 'Buscar' },
  { value: 'photo', label: 'Foto' },
  { value: 'text', label: 'Descrever' },
  { value: 'manual', label: 'Manual' },
];

const SHORT_MEAL: Record<MealType, string> = {
  BREAKFAST: 'Café',
  LUNCH: 'Almoço',
  SNACK: 'Lanche',
  DINNER: 'Jantar',
};

export function AddMealView() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const today = todayISO();

  const paramType = params.get('type') as MealType | null;
  const paramDate = params.get('date');

  const [mode, setMode] = useState<Mode>('search');
  const [type, setType] = useState<MealType>(
    paramType && MEAL_ORDER.includes(paramType) ? paramType : mealTypeForNow(),
  );
  const [date, setDate] = useState(isValidISO(paramDate) && paramDate <= today ? paramDate : today);

  const [items, setItems] = useState<DraftItem[]>([]);
  const [source, setSource] = useState<MealSource>('MANUAL');
  const [notes, setNotes] = useState<string | null>(null);

  const [photo, setPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [hint, setHint] = useState('');
  const [description, setDescription] = useState('');

  const [busy, setBusy] = useState<'analyze' | 'save' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  const totals = useMemo(
    () =>
      items.reduce(
        (t, i) => ({
          kcal: t.kcal + resolveKcal(i),
          protein: t.protein + parseNum(i.protein),
          carbs: t.carbs + parseNum(i.carbs),
          fat: t.fat + parseNum(i.fat),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [items],
  );

  function chooseMode(next: Mode) {
    setMode(next);
    setError(null);
    if (next === 'manual' && items.length === 0) setItems([newDraft()]);
  }

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const blob = await compressImage(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /** Item da busca. A refeição só vira SEARCH se nenhuma análise por IA tiver sido usada. */
  function addFromSearch(item: DraftItem) {
    setItems((prev) => [...prev.filter((i) => i.name.trim() || resolveKcal(i) > 0), item]);
    setSource((prev) => (prev === 'MANUAL' ? 'SEARCH' : prev));
    setError(null);
  }

  function applyAnalysis(result: AnalysisResult, from: MealSource) {
    setItems((prev) => [...prev.filter((i) => i.name.trim() || resolveKcal(i) > 0), ...result.items.map(draftFromAnalysis)]);
    setNotes(result.notes);
    setSource((prev) => (prev === 'PHOTO' || from === 'PHOTO' ? 'PHOTO' : from));
  }

  async function analyzePhoto() {
    if (!photo) return;
    setBusy('analyze');
    setError(null);
    try {
      const form = new FormData();
      form.append('image', photo.blob, 'refeicao.jpg');
      if (hint.trim()) form.append('hint', hint.trim());
      applyAnalysis(await api<AnalysisResult>('/analysis/photo', { method: 'POST', body: form }), 'PHOTO');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function analyzeText() {
    setBusy('analyze');
    setError(null);
    try {
      applyAnalysis(
        await api<AnalysisResult>('/analysis/text', { method: 'POST', json: { description } }),
        'TEXT',
      );
      setDescription('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const valid = items.filter((i) => i.name.trim());
    if (valid.length === 0) {
      setError('Dê um nome a pelo menos um alimento.');
      return;
    }
    setBusy('save');
    setError(null);
    try {
      await api('/meals', {
        method: 'POST',
        json: { date, type, source, items: valid.map(toPayload) },
      });
      await mutate(`/days/${date}`);
      router.push(date === today ? '/' : `/?date=${date}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <main className="screen">
      <header className="header" style={{ alignItems: 'center' }}>
        <button className="btn btn-glass btn-icon" onClick={() => router.back()} aria-label="Voltar">
          <ChevronLeft width={20} height={20} />
        </button>
        <h1 className="headline">Nova refeição</h1>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      <section className="card glass stack">
        <div className="segmented" role="group" aria-label="Refeição">
          {MEAL_ORDER.map((t) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
              {SHORT_MEAL[t]}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">Dia</span>
          <input
            className="input"
            type="date"
            value={date}
            max={today}
            onChange={(e) => isValidISO(e.target.value) && setDate(e.target.value)}
          />
        </label>
      </section>

      <div className="segmented" role="group" aria-label="Como registrar">
        {MODES.map((m) => (
          <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => chooseMode(m.value)}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'search' && <FoodSearch onAdd={addFromSearch} />}

      {mode === 'photo' && (
        <section className="stack">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onPickPhoto}
            aria-label="Escolher foto da refeição"
          />
          <button
            type="button"
            className="photo-drop glass"
            onClick={() => fileInput.current?.click()}
            disabled={busy === 'analyze'}
          >
            {photo ? (
              <>
                <img src={photo.url} alt="Foto da refeição" />
                {busy === 'analyze' && <span className="scan" aria-hidden />}
              </>
            ) : (
              <>
                <CameraIcon />
                Tirar ou escolher foto
                <span className="caption">Enquadre o prato inteiro, de cima</span>
              </>
            )}
          </button>
          {photo && (
            <>
              <label className="field">
                <span className="field-label">Algo que a foto não mostra? (opcional)</span>
                <input
                  className="input"
                  placeholder="Ex.: arroz integral, frango sem óleo"
                  value={hint}
                  maxLength={300}
                  onChange={(e) => setHint(e.target.value)}
                />
              </label>
              <div className="grid-2">
                <button className="btn btn-glass" onClick={() => fileInput.current?.click()} disabled={!!busy}>
                  Trocar foto
                </button>
                <button className="btn btn-primary" onClick={analyzePhoto} disabled={!!busy}>
                  {busy === 'analyze' ? <span className="spinner" aria-hidden /> : <SparkIcon width={20} height={20} />}
                  {busy === 'analyze' ? 'Analisando' : 'Analisar'}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {mode === 'text' && (
        <section className="card glass stack">
          <label className="field">
            <span className="field-label">O que você comeu?</span>
            <textarea
              className="textarea"
              placeholder="Ex.: 2 ovos mexidos, 1 pão francês com manteiga e café com leite"
              value={description}
              maxLength={600}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button
            className="btn btn-primary btn-block"
            onClick={analyzeText}
            disabled={!!busy || description.trim().length < 3}
          >
            {busy === 'analyze' ? <span className="spinner" aria-hidden /> : <SparkIcon width={20} height={20} />}
            {busy === 'analyze' ? 'Estimando' : 'Estimar nutrientes'}
          </button>
        </section>
      )}

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {items.length > 0 && (
        <section className="stack" aria-label="Alimentos">
          <div className="spread" style={{ padding: '0 4px' }}>
            <h2 className="section-title" style={{ padding: 0 }}>
              Alimentos
            </h2>
            <span className="caption">Toque para ajustar</span>
          </div>
          {notes && <p className="note">{notes}</p>}
          <ItemsEditor items={items} onChange={setItems} />
        </section>
      )}

      {(items.length > 0 || mode === 'manual') && (
        <button type="button" className="btn btn-glass btn-block" onClick={() => setItems((p) => [...p, newDraft()])}>
          <PlusIcon width={20} height={20} />
          Adicionar alimento
        </button>
      )}

      {items.length > 0 && (
        <div className="totals-bar glass">
          <div>
            <span className="headline num">{fmtInt(totals.kcal)} kcal</span>
            <p className="caption">
              <MacroDots m={totals} />
            </p>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={!!busy}>
            {busy === 'save' ? <span className="spinner" aria-label="Salvando" /> : 'Salvar refeição'}
          </button>
        </div>
      )}
    </main>
  );
}

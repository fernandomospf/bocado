'use client';

/* eslint-disable @next/next/no-img-element */
import { useRouter, useSearchParams } from 'next/navigation';
import { type ChangeEvent, type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { isValidISO, todayISO } from '@/lib/date';
import { fmtInt, parseNum } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { compressImage } from '@/lib/image';
import { MEAL_ORDER, MEAL_SHORT, mealTypeForNow } from '@/lib/labels';
import { recipeToFood } from '@/lib/recipe';
import { useQuickMeals } from '@/lib/quickMeals';
import {
  applyFatChoice,
  type FatChoice,
  type FatQuestionState,
  isFatItem,
  nextFatState,
} from '@/lib/preparationFat';
import type { AnalysisResult, FoodResult, MealSource, MealType, PreparationFatTable, QuickItem } from '@/lib/types';
import { BarcodeFlow } from './BarcodeFlow';
import { FoodPortionSheet } from './FoodPortionSheet';
import { FoodSearch } from './FoodSearch';
import { FatQuestion } from './FatQuestion';
import { MacroDots } from './MacroLegend';
import { BarcodeIcon, CameraIcon, ChevronLeft, ImageIcon, PlusIcon, SparkIcon } from './Icons';
import { PREFILL_KEY } from './CloseDayCard';
import { AiBlockedNotice, AiQuotaHint, useAiBlocked, useRefreshAiQuota } from './AiQuotaHint';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { NO_SPLIT, SplitPicker, type SplitState, splitIncomplete, splitReady } from './SplitPicker';
import { useSharedSave } from '@/lib/sharedMeals';
import {
  type DraftItem,
  draftFromAnalysis,
  draftFromValues,
  ItemsEditor,
  newDraft,
  resolveKcal,
  toMealPayload,
} from './ItemsEditor';
import { QuickChips, type QuickSource } from './QuickChips';

type Mode = 'search' | 'barcode' | 'photo' | 'text' | 'manual';

const MODES: { value: Mode; label: string }[] = [
  { value: 'search', label: 'Buscar' },
  { value: 'barcode', label: 'Código' },
  { value: 'photo', label: 'Foto' },
  { value: 'text', label: 'Descrever' },
  { value: 'manual', label: 'Manual' },
];

export function AddMealView() {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const quick = useQuickMeals();
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
  const [split, setSplit] = useState<SplitState>(NO_SPLIT);
  const saveShared = useSharedSave();
  const refreshQuota = useRefreshAiQuota();
  const photoBlocked = useAiBlocked('PHOTO');
  const textBlocked = useAiBlocked('TEXT');
  // Atalhos quando a IA está indisponível (cota ou pausa): o que continua funcionando
  const aiAlternatives = [
    { label: 'Buscar alimento', onClick: () => chooseMode('search') },
    { label: 'Ler código de barras', onClick: () => chooseMode('barcode') },
    { label: 'Digitar', onClick: () => chooseMode('manual') },
  ];
  const { hideCalories: hide } = useDisplayPrefs();
  const [dragging, setDragging] = useState(false);
  const [chipFood, setChipFood] = useState<FoodResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Câmera abre direto a câmera traseira; Galeria (e "Trocar foto") abre o seletor do sistema
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Pergunta da gordura de preparo (só depois de uma análise com comida cozida)
  const [fat, setFat] = useState<FatQuestionState | null>(null);
  const fatRef = useRef(fat); // lido depois do await da análise: o usuário pode ter tocado num chip no meio
  fatRef.current = fat;
  const { data: fatTable } = useSWR<PreparationFatTable>('/analysis/preparation-fat', { revalidateOnFocus: false });

  // A tabela chegou depois da análise (rede lenta): monta agora o item da escolha atual
  useEffect(() => {
    const current = fatRef.current;
    if (fatTable && current) setItems((prev) => applyFatChoice(prev, current.choice, fatTable));
  }, [fatTable]);

  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  // Sugestão "Para fechar o dia": chega como rascunho editável (os itens entram no editor, nada é salvo sozinho)
  useEffect(() => {
    if (params.get('prefill') !== '1') return;
    const raw = sessionStorage.getItem(PREFILL_KEY);
    sessionStorage.removeItem(PREFILL_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { items?: Parameters<typeof draftFromValues>[0][] };
      if (Array.isArray(draft.items) && draft.items.length) {
        setItems(draft.items.map(draftFromValues));
        setSource('MANUAL');
      }
    } catch {
      // Rascunho corrompido: segue com a tela vazia
    }
  }, [params]);

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

  const analyzing = busy === 'analyze';
  const photoAnalyzed = items.some((i) => i.fromPhoto);

  function chooseMode(next: Mode) {
    setMode(next);
    setError(null);
    if (next === 'manual' && items.length === 0) setItems([newDraft()]);
  }

  async function loadPhoto(file: File) {
    if (photoBlocked) return; // cota esgotada: nada de arrastar e soltar para a IA
    if (!file.type.startsWith('image/')) {
      setError('Solte uma imagem (JPG, PNG ou WebP).');
      return;
    }
    setError(null);
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch (err) {
      setError(errorMessage(err));
      return;
    }
    setPhoto({ blob, url: URL.createObjectURL(blob) });
    setHint(''); // a dica era da foto anterior
    // Um toque a menos: a análise começa sozinha assim que a foto está pronta
    await analyzePhoto(blob, '');
  }

  async function onPickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await loadPhoto(file);
  }

  /** Desktop: arrastar e soltar a imagem na área da foto (além do clique). */
  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && busy !== 'analyze') void loadPhoto(file);
  }

  /** Item da busca. A refeição só vira SEARCH se nenhuma análise por IA tiver sido usada. */
  function addFromSearch(item: DraftItem) {
    setItems((prev) => [...prev.filter((i) => i.name.trim() || resolveKcal(i) > 0), item]);
    setSource((prev) => (prev === 'MANUAL' ? 'SEARCH' : prev));
    setError(null);
  }

  /** Favorita ou recente: os itens entram no editor (editáveis); a origem da refeição não muda. */
  function addQuickItems(quickItems: QuickItem[]) {
    setItems((prev) => [...prev.filter((i) => i.name.trim() || resolveKcal(i) > 0), ...quickItems.map(draftFromValues)]);
    setError(null);
    tap();
  }

  /** "Registrar direto": salva na hora e volta para o dia (o toast oferece Desfazer). */
  async function registerQuick(src: QuickSource) {
    if (busy) return;
    setBusy('save');
    setError(null);
    const meal =
      src.kind === 'favorite' ? await quick.logFavorite(src.id, date, type) : await quick.repeat(src.id, date, type);
    if (meal) router.push(date === today ? '/' : `/?date=${date}`);
    else setBusy(null);
  }

  function applyAnalysis(result: AnalysisResult, from: MealSource) {
    const nextFat = nextFatState(fatRef.current, result.hasCookedFood, result.preparationFat);
    const fromPhoto = from === 'PHOTO';
    setFat(nextFat);
    setItems((prev) => {
      // O item de gordura sai e volta no fim da lista, depois dos alimentos novos.
      // Uma análise de foto substitui os itens da foto anterior; os adicionados à mão ficam.
      const kept = prev.filter(
        (i) => !isFatItem(i) && !(fromPhoto && i.fromPhoto) && (i.name.trim() || resolveKcal(i) > 0),
      );
      const added = result.items.map((r) => ({ ...draftFromAnalysis(r), ...(fromPhoto ? { fromPhoto: true } : {}) }));
      const next = [...kept, ...added];
      return nextFat && fatTable ? applyFatChoice(next, nextFat.choice, fatTable) : next;
    });
    setNotes(result.notes);
    setSource((prev) => (prev === 'PHOTO' || from === 'PHOTO' ? 'PHOTO' : from));
  }

  function chooseFat(patch: Partial<FatChoice>) {
    if (!fat) return;
    tap();
    const choice = { ...fat.choice, ...patch };
    setFat({ ...fat, choice, touched: true });
    if (fatTable) setItems((prev) => applyFatChoice(prev, choice, fatTable));
  }

  /** Mudanças vindas do editor: remover o item de gordura à mão equivale a escolher "Nada". */
  function changeItems(next: DraftItem[]) {
    setItems(next);
    if (!fat) return;
    if (next.length === 0) setFat(null);
    else if (fat.choice.level !== 'none' && !next.some(isFatItem)) {
      setFat({ ...fat, choice: { ...fat.choice, level: 'none' }, touched: true });
    }
  }

  async function analyzePhoto(blob: Blob, hintText: string) {
    setBusy('analyze');
    setError(null);
    try {
      const form = new FormData();
      form.append('image', blob, 'refeicao.jpg');
      if (hintText.trim()) form.append('hint', hintText.trim());
      applyAnalysis(await api<AnalysisResult>('/analysis/photo', { method: 'POST', body: form }), 'PHOTO');
    } catch (err) {
      // 429 de cota traz a mensagem do servidor (em português), que já vem em errorMessage
      setError(errorMessage(err));
    } finally {
      setBusy(null);
      refreshQuota();
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
      refreshQuota();
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
      if (splitReady(split)) {
        await saveShared({ date, type, source, items: valid.map(toMealPayload), shares: split.shares });
      } else {
        await api('/meals', {
          method: 'POST',
          json: { date, type, source, items: valid.map(toMealPayload) },
        });
      }
      await mutate(`/days/${date}`);
      void mutate('/recipes'); // a contagem de uso ("mais usadas") pode ter mudado
      router.push(date === today ? '/' : `/?date=${date}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <main className="screen add-meal">
      <header className="header" style={{ alignItems: 'center' }}>
        <button className="btn btn-glass btn-icon" onClick={() => router.back()} aria-label="Voltar">
          <ChevronLeft width={20} height={20} />
        </button>
        <h1 className="headline">Nova refeição</h1>
        <span style={{ width: 44 }} aria-hidden />
      </header>

      {/* Desktop: entrada à esquerda e painel de alimentos à direita; no celular, display: contents */}
      <div className="add-input">
        <section className="card glass stack">
          <div className="segmented" role="group" aria-label="Refeição">
            {MEAL_ORDER.map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
                {MEAL_SHORT[t]}
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

        <QuickChips
          type={type}
          onPickRecipe={(r) => setChipFood(recipeToFood(r))}
          onPickItems={addQuickItems}
          onRegister={(src) => void registerQuick(src)}
          disabled={!!busy}
        />

        <div className="segmented segmented-modes" role="group" aria-label="Como registrar">
          {MODES.map((m) => (
            <button key={m.value} type="button" aria-pressed={mode === m.value} onClick={() => chooseMode(m.value)}>
              {m.value === 'barcode' && <BarcodeIcon width={16} height={16} />}
              {m.label}
            </button>
          ))}
        </div>

        {mode === 'search' && <FoodSearch onAdd={addFromSearch} />}

        {mode === 'barcode' && <BarcodeFlow onAdd={addFromSearch} onChooseMode={chooseMode} />}

        {mode === 'photo' && (
          <section className="stack">
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              onChange={onPickPhoto}
              aria-label="Tirar foto da refeição"
            />
            <input
              ref={galleryInput}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              onChange={onPickPhoto}
              aria-label="Escolher foto da refeição"
            />
            {/* Área de pré-visualização; no desktop também recebe a imagem arrastada */}
            <div
              className="photo-drop glass"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                if (!dragging) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              data-dragging={dragging || undefined}
              aria-busy={analyzing || undefined}
            >
              {photo ? (
                <>
                  <img src={photo.url} alt="Foto da refeição" />
                  {analyzing && <span className="scan" aria-hidden />}
                </>
              ) : (
                <>
                  <CameraIcon />
                  Fotografe o prato
                  <span className="caption">Enquadre o prato inteiro, de cima</span>
                  <span className="caption desktop-only">ou arraste a imagem para cá</span>
                </>
              )}
            </div>

            <p className="sr-only" role="status">
              {analyzing ? 'Analisando a foto' : ''}
            </p>

            {photo ? (
              <div className={photoAnalyzed || analyzing ? 'stack' : 'grid-2'}>
                <button
                  type="button"
                  className="btn btn-glass"
                  onClick={() => galleryInput.current?.click()}
                  disabled={!!busy || photoBlocked}
                >
                  {analyzing ? <span className="spinner" aria-hidden /> : null}
                  {analyzing ? 'Analisando a foto' : 'Trocar foto'}
                </button>
                {/* A análise falhou: tentar de novo com a mesma foto */}
                {!photoAnalyzed && !analyzing && (
                  <button type="button" className="btn btn-primary" onClick={() => analyzePhoto(photo.blob, hint)} disabled={photoBlocked}>
                    <SparkIcon width={20} height={20} />
                    Analisar de novo
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="grid-2 not-desktop">
                  <button type="button" className="btn btn-primary" onClick={() => cameraInput.current?.click()} disabled={!!busy || photoBlocked}>
                    <CameraIcon width={20} height={20} />
                    Câmera
                  </button>
                  <button type="button" className="btn btn-glass" onClick={() => galleryInput.current?.click()} disabled={!!busy || photoBlocked}>
                    <ImageIcon width={20} height={20} />
                    Galeria
                  </button>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-block desktop-only"
                  onClick={() => galleryInput.current?.click()}
                  disabled={!!busy || photoBlocked}
                >
                  <ImageIcon width={20} height={20} />
                  Escolher foto
                </button>
              </>
            )}
            <AiBlockedNotice feature="PHOTO" alternatives={aiAlternatives} />
            <AiQuotaHint feature="PHOTO" />
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
              disabled={!!busy || description.trim().length < 3 || textBlocked}
            >
              {busy === 'analyze' ? <span className="spinner" aria-hidden /> : <SparkIcon width={20} height={20} />}
              {busy === 'analyze' ? 'Estimando' : 'Estimar nutrientes'}
            </button>
            <AiBlockedNotice feature="TEXT" alternatives={aiAlternatives} />
            <AiQuotaHint feature="TEXT" />
          </section>
        )}

        {/* Cota esgotada: o aviso neutro com alternativas já aparece acima, então não repete o erro */}
        {error && !(mode === 'photo' && photoBlocked) && !(mode === 'text' && textBlocked) && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </div>

      <div className="add-panel">
        {items.length === 0 && mode !== 'manual' && (
          <div className="add-panel-empty card glass desktop-only">
            <p className="headline">Alimentos</p>
            <p className="body-2">
              Busque, fotografe ou descreva a refeição: os alimentos aparecem aqui para você ajustar antes de salvar.
            </p>
          </div>
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
            {fat && <FatQuestion state={fat} onChange={chooseFat} />}
            <ItemsEditor items={items} onChange={changeItems} />
            {/* A dica vem depois da análise: corrige o que a foto não mostra sem atrasar o primeiro resultado */}
            {photo && photoAnalyzed && (
              <section className="card glass stack" aria-label="Dica para a foto">
                <label className="field">
                  <span className="field-label">Algo que a foto não mostra?</span>
                  <input
                    className="input"
                    placeholder="Ex.: arroz integral, frango sem óleo"
                    value={hint}
                    maxLength={300}
                    enterKeyHint="send"
                    onChange={(e) => setHint(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && hint.trim() && !busy) void analyzePhoto(photo.blob, hint);
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-glass"
                  onClick={() => analyzePhoto(photo.blob, hint)}
                  disabled={!!busy || !hint.trim()}
                >
                  {analyzing ? <span className="spinner" aria-hidden /> : <SparkIcon width={20} height={20} />}
                  {analyzing ? 'Reanalisando' : 'Reanalisar com a dica'}
                </button>
                <p className="caption">Substitui os itens da foto; os que você adicionou à mão ficam.</p>
              </section>
            )}
          </section>
        )}

        {(items.length > 0 || mode === 'manual') && (
          <button type="button" className="btn btn-glass btn-block" onClick={() => setItems((p) => [...p, newDraft()])}>
            <PlusIcon width={20} height={20} />
            Adicionar alimento
          </button>
        )}

        {items.length > 0 && <SplitPicker value={split} onChange={setSplit} totalKcal={totals.kcal} totalProtein={totals.protein} />}

        {items.length > 0 && (
          <div className="totals-bar glass">
            <div>
              {!hide && <span className="headline num">{fmtInt(totals.kcal)} kcal</span>}
              <p className="caption">
                <MacroDots m={totals} />
              </p>
            </div>
            <button className="btn btn-primary" onClick={save} disabled={!!busy || splitIncomplete(split)}>
              {busy === 'save' ? <span className="spinner" aria-label="Salvando" /> : 'Salvar refeição'}
            </button>
          </div>
        )}
      </div>

      {chipFood && (
        <FoodPortionSheet
          key={chipFood.id}
          food={chipFood}
          onClose={() => setChipFood(null)}
          onAdd={(item) => {
            addFromSearch(item);
            setChipFood(null);
          }}
        />
      )}
    </main>
  );
}

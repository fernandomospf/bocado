'use client';

/* eslint-disable @next/next/no-img-element */
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtInt, parseNum } from '@/lib/format';
import { compressImage } from '@/lib/image';
import type { BarcodeLookup, Confidence, FoodResult, Macros } from '@/lib/types';
import { BarcodeScanner } from './BarcodeScanner';
import { FoodPortionSheet } from './FoodPortionSheet';
import { BarcodeIcon, CameraIcon } from './Icons';
import { type DraftItem, draftFromPer100 } from './ItemsEditor';
import { useToast } from './Toast';

/** Rascunho devolvido por POST /analysis/label (nada foi salvo ainda). */
interface LabelDraft {
  barcode: string | null;
  name: string;
  brand: string | null;
  per100: Macros;
  serving: { grams: number; label: string } | null;
  per100Available: boolean;
  confidence: Confidence;
  errors: string[];
  warnings: string[];
}

type Step =
  | { step: 'scan' }
  | { step: 'looking'; code: string }
  | { step: 'idle' }
  | { step: 'photos'; code: string | null }
  | { step: 'reading'; code: string | null }
  | { step: 'review'; draft: LabelDraft };

const CONFIDENCE: Record<Confidence, { label: string; className: string }> = {
  low: { label: 'Confira com atenção', className: 'badge-low' },
  medium: { label: 'Leitura provável', className: '' },
  high: { label: 'Leitura confiável', className: 'badge-high' },
};

const num = (n: number) => (n ? String(n).replace('.', ',') : '');

/** Mesma checagem do servidor, ao vivo na revisão: limites físicos (bloqueiam) e coerência da energia (aviso). */
function sanity(p: Macros) {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!(p.kcal > 0)) errors.push('Informe as calorias.');
  if (p.kcal > 900) errors.push('Calorias acima de 900 kcal por 100 g: confira se não leu a coluna da porção ou o valor em kJ.');
  if (p.protein + p.carbs + p.fat > 100) errors.push('Proteína + carboidratos + gorduras passam de 100 g em 100 g de produto.');
  const expected = p.protein * 4 + p.carbs * 4 + p.fat * 9;
  if (p.kcal > 0 && expected > 0 && Math.abs(p.kcal - expected) / expected > 0.2) {
    warnings.push(`As calorias diferem mais de 20% do esperado pelos macros (~${fmtInt(expected)} kcal). Confira a tabela.`);
  }
  return { errors, warnings };
}

/**
 * Modo "Código": lê o código → produto do acervo (ou do Open Food Facts) → Sheet de porção.
 * Não encontrado: fotos da embalagem → leitura pela IA (uma vez por produto) → revisão → salva no acervo.
 */
export function BarcodeFlow({ onAdd }: { onAdd: (item: DraftItem) => void }) {
  const toast = useToast();
  const [state, setState] = useState<Step>({ step: 'scan' });
  const [found, setFound] = useState<FoodResult | null>(null);

  async function lookup(code: string) {
    setState({ step: 'looking', code });
    try {
      const res = await api<BarcodeLookup>(`/foods/barcode/${code}`);
      if (res.found) {
        setFound(res.food);
        setState({ step: 'idle' });
      } else {
        setState({ step: 'photos', code });
      }
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setState({ step: 'scan' });
    }
  }

  function added(item: DraftItem, message?: string) {
    onAdd(item);
    setFound(null);
    setState({ step: 'idle' });
    if (message) toast.show({ message });
  }

  return (
    <>
      {state.step === 'scan' && <BarcodeScanner onDetected={lookup} onNoBarcode={() => setState({ step: 'photos', code: null })} />}

      {state.step === 'looking' && (
        <section className="card glass stack" aria-busy="true" style={{ alignItems: 'center', textAlign: 'center' }}>
          <span className="spinner" aria-hidden />
          <p className="body-2">
            Procurando o código <span className="num">{state.code}</span>…
          </p>
        </section>
      )}

      {state.step === 'idle' && (
        <section className="card glass stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <BarcodeIcon width={32} height={32} style={{ color: 'var(--accent)' }} />
          <p className="body-2">{found ? 'Escolha a quantidade.' : 'Produto adicionado. Leu outro?'}</p>
          <button type="button" className="btn btn-glass" onClick={() => setState({ step: 'scan' })}>
            Ler outro código
          </button>
        </section>
      )}

      {(state.step === 'photos' || state.step === 'reading') && (
        <LabelCapture
          code={state.code}
          reading={state.step === 'reading'}
          onRead={async (front, table) => {
            setState({ step: 'reading', code: state.code });
            try {
              const form = new FormData();
              if (front) form.append('front', front, 'frente.jpg');
              form.append('table', table, 'tabela.jpg');
              if (state.code) form.append('barcode', state.code);
              setState({ step: 'review', draft: await api<LabelDraft>('/analysis/label', { method: 'POST', body: form }) });
            } catch (err) {
              toast.show({ message: errorMessage(err), tone: 'error' });
              setState({ step: 'photos', code: state.code });
            }
          }}
          onBack={() => setState({ step: 'scan' })}
        />
      )}

      {state.step === 'review' && (
        <LabelReview
          draft={state.draft}
          onCancel={() => setState({ step: 'scan' })}
          onSaved={(food, existed) => {
            const grams = food.portion?.grams ?? 100;
            added(
              draftFromPer100(food.name, food.per100, grams, food.id),
              existed ? 'Esse produto já estava no acervo: usamos o que já existia.' : 'Produto salvo no acervo e adicionado.',
            );
          }}
        />
      )}

      {found && (
        <FoodPortionSheet
          key={found.id}
          food={found}
          onClose={() => setFound(null)}
          onAdd={(item) => added(item)}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function LabelCapture({
  code,
  reading,
  onRead,
  onBack,
}: {
  code: string | null;
  reading: boolean;
  onRead: (front: Blob | null, table: Blob) => void;
  onBack: () => void;
}) {
  const [front, setFront] = useState<{ blob: Blob; url: string } | null>(null);
  const [table, setTable] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const frontInput = useRef<HTMLInputElement>(null);
  const tableInput = useRef<HTMLInputElement>(null);

  // Libera as prévias da memória (as fotos nunca são guardadas)
  useEffect(() => () => {
    if (front) URL.revokeObjectURL(front.url);
  }, [front]);
  useEffect(() => () => {
    if (table) URL.revokeObjectURL(table.url);
  }, [table]);

  async function pick(e: ChangeEvent<HTMLInputElement>, set: (v: { blob: Blob; url: string }) => void) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      const blob = await compressImage(file, 1600, 0.85); // tabela precisa de nitidez para os números
      set({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const slot = (
    label: string,
    hint: string,
    value: { url: string } | null,
    input: React.RefObject<HTMLInputElement | null>,
    onChange: (e: ChangeEvent<HTMLInputElement>) => void,
  ) => (
    <div className="stack" style={{ gap: 6 }}>
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onChange} aria-label={label} />
      <button type="button" className="label-slot glass" onClick={() => input.current?.click()} disabled={reading}>
        {value ? (
          <img src={value.url} alt={label} />
        ) : (
          <>
            <CameraIcon />
            <span className="headline">{label}</span>
            <span className="caption">{hint}</span>
          </>
        )}
      </button>
    </div>
  );

  return (
    <section className="stack" aria-label="Produto novo">
      <div className="card glass stack" style={{ gap: 6 }}>
        <h2 className="title">Produto novo</h2>
        <p className="body-2">
          {code ? (
            <>
              O código <span className="num">{code}</span> ainda não está no acervo.{' '}
            </>
          ) : null}
          Fotografe a embalagem: a leitura acontece uma vez e o produto fica salvo para todo mundo.
        </p>
      </div>

      <div className="grid-2">
        {slot('Frente (opcional)', 'Nome e marca', front, frontInput, (e) => pick(e, setFront))}
        {slot('Tabela nutricional', 'Obrigatória', table, tableInput, (e) => pick(e, setTable))}
      </div>

      <ul className="label-tips caption">
        <li>Foto reta, de frente para a tabela.</li>
        <li>Sem reflexo: evite luz direta sobre a embalagem.</li>
        <li>A tabela inteira visível, com os números nítidos.</li>
      </ul>

      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn-primary btn-block" disabled={!table || reading} onClick={() => table && onRead(front?.blob ?? null, table.blob)}>
        {reading ? <span className="spinner" aria-label="Lendo" /> : null}
        {reading ? 'Lendo a tabela' : 'Ler tabela nutricional'}
      </button>
      <button type="button" className="btn btn-plain" onClick={onBack} disabled={reading}>
        Voltar ao leitor
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------

function LabelReview({
  draft,
  onCancel,
  onSaved,
}: {
  draft: LabelDraft;
  onCancel: () => void;
  onSaved: (food: FoodResult, existed: boolean) => void;
}) {
  const { hideCalories: hide } = useDisplayPrefs();
  const [name, setName] = useState(draft.name);
  const [brand, setBrand] = useState(draft.brand ?? '');
  const [values, setValues] = useState({
    kcal: num(draft.per100.kcal),
    protein: num(draft.per100.protein),
    carbs: num(draft.per100.carbs),
    fat: num(draft.per100.fat),
  });
  const [servingGrams, setServingGrams] = useState(num(draft.serving?.grams ?? 0));
  const [servingLabel, setServingLabel] = useState(draft.serving?.label ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const per100 = useMemo(
    () => ({
      kcal: Math.round(parseNum(values.kcal) * 10) / 10,
      protein: Math.round(parseNum(values.protein) * 10) / 10,
      carbs: Math.round(parseNum(values.carbs) * 10) / 10,
      fat: Math.round(parseNum(values.fat) * 10) / 10,
    }),
    [values],
  );
  const check = sanity(per100);
  const confidence = CONFIDENCE[draft.confidence];
  const grams = Math.round(parseNum(servingGrams) * 10) / 10;

  async function save() {
    if (name.trim().length < 2) return setError('Dê um nome ao produto.');
    if (check.errors.length) return setError(check.errors[0]);
    setBusy(true);
    setError(null);
    try {
      const food = await api<FoodResult>('/foods/products', {
        method: 'POST',
        json: {
          ...(draft.barcode ? { barcode: draft.barcode } : {}),
          name: name.trim(),
          ...(brand.trim() ? { brand: brand.trim() } : {}),
          per100,
          ...(grams > 0 ? { serving: { grams, ...(servingLabel.trim() ? { label: servingLabel.trim() } : {}) } } : {}),
        },
      });
      onSaved(food, false);
    } catch (err) {
      // Alguém salvou esse código antes: usa o produto que já existe
      const existing = err instanceof ApiError && err.status === 409 ? (err.data as { product?: FoodResult } | null)?.product : undefined;
      if (existing) return onSaved(existing, true);
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const field = (key: keyof typeof values, label: string, color: string) => (
    <div className="mini-field">
      <label htmlFor={`label-${key}`} style={{ color }}>
        {label}
      </label>
      <input
        id={`label-${key}`}
        className="input"
        inputMode="decimal"
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <section className="stack" aria-label="Revisar produto">
      <div className="card glass stack">
        <div className="spread">
          <h2 className="title">Confira os dados</h2>
          <span className={`badge ${confidence.className}`}>{confidence.label}</span>
        </div>
        {draft.barcode && (
          <p className="caption">
            Código <span className="num">{draft.barcode}</span>
          </p>
        )}

        <label className="field">
          <span className="field-label">Nome</span>
          <input className="input" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Marca (opcional)</span>
          <input className="input" value={brand} maxLength={80} onChange={(e) => setBrand(e.target.value)} />
        </label>

        <div className="stack" style={{ gap: 6 }}>
          <span className="field-label">Por 100 g (ou 100 ml)</span>
          {hide ? (
            <>
              <div className="grid-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {field('protein', 'Prot.', 'var(--ring-protein)')}
                {field('carbs', 'Carb.', 'var(--ring-carbs)')}
                {field('fat', 'Gord.', 'var(--ring-fat)')}
              </div>
              {/* kcal é ENTRADA de dados (rótulo do produto): continua aqui, sem destaque */}
              <details className="adaptive-how">
                <summary>Mais detalhes</summary>
                <div className="grid-4" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 8 }}>
                  {field('kcal', 'kcal', 'var(--text-2)')}
                </div>
              </details>
            </>
          ) : (
            <div className="grid-4">
              {field('kcal', 'kcal', 'var(--ring-kcal)')}
              {field('protein', 'Prot.', 'var(--ring-protein)')}
              {field('carbs', 'Carb.', 'var(--ring-carbs)')}
              {field('fat', 'Gord.', 'var(--ring-fat)')}
            </div>
          )}
        </div>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">Porção (g ou ml)</span>
            <input className="input num" inputMode="decimal" placeholder="Opcional" value={servingGrams} onChange={(e) => setServingGrams(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Como no rótulo</span>
            <input className="input" placeholder="Ex.: 30 g (1 xícara)" value={servingLabel} maxLength={60} onChange={(e) => setServingLabel(e.target.value)} />
          </label>
        </div>

        {[...check.errors].map((m) => (
          <p key={m} className="alert" role="alert">
            {m}
          </p>
        ))}
        {[...draft.warnings.filter((w) => w.startsWith('O rótulo só tinha')), ...check.warnings].map((m) => (
          <p key={m} className="note">
            {m}
          </p>
        ))}
        {error && !check.errors.includes(error) && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
      </div>

      <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy || check.errors.length > 0}>
        {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar no acervo e adicionar'}
      </button>
      <button type="button" className="btn btn-plain" onClick={onCancel} disabled={busy}>
        Cancelar
      </button>
    </section>
  );
}

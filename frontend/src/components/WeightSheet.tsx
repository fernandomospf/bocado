'use client';

import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { isValidISO, todayISO } from '@/lib/date';
import { parseNum } from '@/lib/format';
import type { WeightEntry } from '@/lib/types';
import { Sheet } from './Sheet';

const toText = (n: number | undefined) => (n ? String(n).replace('.', ',') : '');

interface WeightSheetProps {
  /** Registro em edição; sem ele, é um registro novo. */
  entry?: WeightEntry;
  /** Pré-preenchimento de um registro novo (último peso). */
  defaultWeight?: number;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

/** Registrar, editar ou excluir a pesagem de um dia. */
export function WeightSheet({ entry, defaultWeight, onClose, onSaved }: WeightSheetProps) {
  const today = todayISO();
  const [weight, setWeight] = useState(toText(entry?.weightKg ?? defaultWeight));
  const [date, setDate] = useState(entry?.date ?? today);
  const [note, setNote] = useState(entry?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const weightKg = Math.round(parseNum(weight) * 10) / 10;
    if (weightKg < 30 || weightKg > 350) {
      setError('Informe um peso entre 30 e 350 kg.');
      return;
    }
    if (!isValidISO(date) || date > today) {
      setError('Escolha uma data até hoje.');
      return;
    }
    void run(async () => {
      await api(`/weight/${date}`, { method: 'PUT', json: { weightKg, note: note.trim() } });
      // Mudou a data de um registro existente: o antigo sai (um registro por dia)
      if (entry && entry.date !== date) await api(`/weight/${entry.date}`, { method: 'DELETE' });
    });
  }

  return (
    <Sheet open title={entry ? 'Editar peso' : 'Registrar peso'} onClose={onClose}>
      <form className="stack-lg" onSubmit={onSubmit}>
        <h2 className="title">{entry ? 'Editar peso' : 'Registrar peso'}</h2>

        <div className="grid-2">
          <label className="field">
            <span className="field-label">Peso</span>
            <div className="input-suffix">
              <input
                className="input num"
                inputMode="decimal"
                autoComplete="off"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                autoFocus
              />
              <span>kg</span>
            </div>
          </label>
          <label className="field">
            <span className="field-label">Dia</span>
            <input
              className="input"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Nota (opcional)</span>
          <input
            className="input"
            placeholder="Ex.: em jejum, depois do treino"
            value={note}
            maxLength={140}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
            {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar'}
          </button>
          {entry && (
            <button
              type="button"
              className="btn btn-glass btn-block btn-danger"
              disabled={busy}
              onClick={() => run(() => api(`/weight/${entry.date}`, { method: 'DELETE' }))}
            >
              Excluir registro
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

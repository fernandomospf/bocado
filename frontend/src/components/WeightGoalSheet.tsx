'use client';

import { type FormEvent, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtDec, parseNum } from '@/lib/format';
import type { WeightSummary } from '@/lib/types';
import { isWeightKey } from './WeightSection';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Definir, editar ou remover a meta de peso. As mensagens de validação vêm do servidor (IMC mínimo, coerência com o objetivo). */
export function WeightGoalSheet({ summary, onClose }: { summary: WeightSummary; onClose: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const goal = summary.goal;
  const reference = summary.trendKg ?? summary.latest?.weightKg ?? null;
  const [value, setValue] = useState(goal ? String(goal.targetKg).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(goalWeightKg: number | null, done: string) {
    setBusy(true);
    setError(null);
    try {
      await api('/weight/goal', { method: 'PUT', json: { goalWeightKg } });
      await mutate(isWeightKey);
      toast.show({ message: done, durationMs: 2500 });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const kg = Math.round(parseNum(value) * 10) / 10;
    if (!(kg >= 30 && kg <= 350)) return setError('Informe uma meta entre 30 e 350 kg.');
    void run(kg, goal ? 'Meta atualizada' : 'Meta de peso definida');
  }

  return (
    <Sheet open title={goal ? 'Editar meta de peso' : 'Definir meta de peso'} onClose={onClose}>
      <form className="stack-lg" onSubmit={onSubmit}>
        <h2 className="title">{goal ? 'Editar meta de peso' : 'Definir meta de peso'}</h2>
        {reference !== null && (
          <p className="body-2 num">
            Seu peso de referência agora (tendência): {fmtDec(reference)} kg
          </p>
        )}

        <label className="field">
          <span className="field-label">Meta</span>
          <div className="input-suffix">
            <input
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              placeholder="Ex.: 72,5"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
            <span>kg</span>
          </div>
        </label>
        <p className="caption">A meta é só uma referência para o gráfico: ela não muda as suas metas de calorias.</p>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          <button className="btn btn-primary btn-block" type="submit" disabled={busy || !value.trim()}>
            {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar meta'}
          </button>
          {goal && (
            <button type="button" className="btn btn-plain btn-block" disabled={busy} onClick={() => void run(null, 'Meta removida')}>
              Remover meta
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

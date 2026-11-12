'use client';

import { type FormEvent, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { parseNum } from '@/lib/format';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS } from '@/lib/labels';
import type { BodyData, Profile } from '@/lib/types';

/** Edição dos dados corporais no Perfil. Metas personalizadas são preservadas pelo servidor. */
export function BodyForm({ profile, onSaved }: { profile: Profile; onSaved: (p: Profile) => void }) {
  const [form, setForm] = useState({
    goal: profile.goal,
    sex: profile.sex,
    birthDate: profile.birthDate,
    height: String(profile.heightCm),
    weight: String(profile.weightKg).replace('.', ','),
    activityLevel: profile.activityLevel,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body: BodyData = {
      goal: form.goal,
      sex: form.sex,
      birthDate: form.birthDate,
      heightCm: Math.round(parseNum(form.height)),
      weightKg: Math.round(parseNum(form.weight) * 10) / 10,
      activityLevel: form.activityLevel,
    };
    try {
      onSaved(await api<Profile>('/profile', { method: 'PUT', json: body }));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form className="stack-lg" onSubmit={onSubmit}>
      <h2 className="title">Seus dados</h2>

      <label className="field">
        <span className="field-label">Objetivo</span>
        <select
          className="select"
          value={form.goal}
          onChange={(e) => setForm({ ...form, goal: e.target.value as BodyData['goal'] })}
        >
          {GOAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="grid-2">
        <label className="field">
          <span className="field-label">Peso</span>
          <div className="input-suffix">
            <input
              className="input num"
              inputMode="decimal"
              value={form.weight}
              onChange={(e) => setForm({ ...form, weight: e.target.value })}
            />
            <span>kg</span>
          </div>
        </label>
        <label className="field">
          <span className="field-label">Altura</span>
          <div className="input-suffix">
            <input
              className="input num"
              inputMode="numeric"
              value={form.height}
              onChange={(e) => setForm({ ...form, height: e.target.value })}
            />
            <span>cm</span>
          </div>
        </label>
      </div>

      <label className="field">
        <span className="field-label">Atividade física</span>
        <select
          className="select"
          value={form.activityLevel}
          onChange={(e) => setForm({ ...form, activityLevel: e.target.value as BodyData['activityLevel'] })}
        >
          {ACTIVITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}: {o.hint.toLowerCase()}
            </option>
          ))}
        </select>
      </label>

      <div className="grid-2">
        <div className="field">
          <span className="field-label">Sexo biológico</span>
          <div className="segmented" role="group" aria-label="Sexo biológico">
            <button type="button" aria-pressed={form.sex === 'FEMALE'} onClick={() => setForm({ ...form, sex: 'FEMALE' })}>
              Fem.
            </button>
            <button type="button" aria-pressed={form.sex === 'MALE'} onClick={() => setForm({ ...form, sex: 'MALE' })}>
              Masc.
            </button>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Nascimento</span>
          <input
            className="input"
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
          />
        </label>
      </div>

      {profile.customTargets && (
        <p className="note">Suas metas personalizadas serão mantidas. Para recalcular, use “Usar sugestão”.</p>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn-primary btn-block" disabled={busy} type="submit">
        {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar dados'}
      </button>
    </form>
  );
}

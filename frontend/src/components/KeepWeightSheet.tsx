'use client';

import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useProfile } from '@/lib/hooks';
import type { Profile, Suggestion } from '@/lib/types';
import { isWeightKey } from './WeightSection';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/**
 * "Passar para manter o peso": mostra como ficam as metas e, ao confirmar, muda o objetivo para MAINTAIN usando a mesma
 * lógica de recálculo do perfil (PUT /profile) e remove a meta de peso.
 */
export function KeepWeightSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data: profile } = useProfile();
  const { hideCalories: hide } = useDisplayPrefs();
  const [preview, setPreview] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const body = profile
    ? {
        sex: profile.sex,
        birthDate: profile.birthDate,
        heightCm: profile.heightCm,
        weightKg: profile.weightKg,
        activityLevel: profile.activityLevel,
        goal: 'MAINTAIN' as const,
      }
    : null;

  useEffect(() => {
    if (!body) return;
    api<Suggestion>('/profile/preview', { method: 'POST', json: body })
      .then(setPreview)
      .catch((err) => setError(errorMessage(err)));
  }, [profile?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api<Profile>('/profile', { method: 'PUT', json: body });
      await api('/weight/goal', { method: 'PUT', json: { goalWeightKg: null } });
      await mutate('/profile', updated, { revalidate: false });
      await mutate(isWeightKey);
      void mutate((key) => typeof key === 'string' && key.startsWith('/days'));
      toast.show({ message: 'Objetivo atualizado para manter o peso', durationMs: 3500 });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const custom = profile?.customTargets ?? false;

  return (
    <Sheet open title="Passar para manter o peso" onClose={onClose}>
      <div className="stack-lg">
        <h2 className="title">Passar para manter o peso</h2>
        <p className="body-2">O objetivo do perfil muda para manter o peso e a meta de peso é removida. Seus registros ficam como estão.</p>

        {profile && (
          <section className="card glass stack-sm" aria-label="Como ficam as metas">
            <h3 className="headline">Como ficam as metas</h3>
            {custom ? (
              <p className="body-2">Você personalizou as suas metas, então elas serão mantidas como estão.</p>
            ) : preview ? (
              <div className="grid-2">
                <div className="stat">
                  <span className="caption">Agora</span>
                  <strong className="num">{hide ? `${fmtInt(profile.targets.protein)} g de proteína` : `${fmtInt(profile.targets.kcal)} kcal`}</strong>
                </div>
                <div className="stat">
                  <span className="caption">Manter o peso</span>
                  <strong className="num">{hide ? `${fmtInt(preview.protein)} g de proteína` : `${fmtInt(preview.kcal)} kcal`}</strong>
                </div>
              </div>
            ) : (
              <div className="skeleton" style={{ height: 52 }} />
            )}
          </section>
        )}

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <div className="stack">
          <button className="btn btn-primary btn-block" onClick={() => void confirm()} disabled={busy || !profile}>
            {busy ? <span className="spinner" aria-label="Salvando" /> : 'Passar para manter o peso'}
          </button>
          <button className="btn btn-plain btn-block" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
        </div>
      </div>
    </Sheet>
  );
}

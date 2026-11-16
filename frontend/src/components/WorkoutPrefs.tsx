'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import type { Profile } from '@/lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

type Patch = Partial<Pick<Profile, 'workoutEstimateEnabled' | 'workoutAddToGoal'>>;

/** Perfil, Preferências > Treino. Tudo desligado por padrão: o treino é contexto, não "calorias para comer". */
export function WorkoutPrefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!profile) return null;

  async function save(patch: Patch) {
    if (!profile) return false;
    tap();
    try {
      await mutate(async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: patch }), {
        optimisticData: {
          ...profile,
          ...patch,
          // Desligar a estimativa desliga a soma junto (o servidor faz o mesmo)
          ...(patch.workoutEstimateEnabled === false ? { workoutAddToGoal: false } : {}),
        },
        rollbackOnError: true,
        revalidate: false,
      });
      // A meta efetiva do dia e as estimativas mudam: revalida os dias e as sugestões
      void globalMutate((key) => typeof key === 'string' && (key.startsWith('/days') || key.startsWith('/suggestions') || key.startsWith('/workouts')));
      return true;
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      return false;
    }
  }

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }}>
        Treino
      </h3>
      <label className="switch-row">
        <span>Mostrar estimativa de gasto dos treinos</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.workoutEstimateEnabled}
          onChange={(e) => void save({ workoutEstimateEnabled: e.target.checked })}
        />
      </label>
      <p className="caption">É uma estimativa aproximada, que pode errar bastante.</p>

      {profile.workoutEstimateEnabled && (
        <>
          <label className="switch-row">
            <span>Somar parte dessa estimativa à meta do dia</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={profile.workoutAddToGoal}
              onChange={(e) => (e.target.checked ? setConfirming(true) : void save({ workoutAddToGoal: false }))}
            />
          </label>
          <p className="caption">
            Somamos só metade do valor, porque sua meta já considera seu nível de atividade. Se você quer perder peso, manter a meta
            sem soma costuma ser mais seguro.
          </p>
        </>
      )}

      {confirming && (
        <Sheet open title="Somar à meta do dia?" onClose={() => setConfirming(false)}>
          <div className="stack-lg">
            <p className="body-2">
              Nos dias com treino, a meta de calorias do dia passa a incluir metade do gasto estimado, com no máximo 600 kcal. A meta
              salva no seu perfil não muda, e você pode desligar quando quiser.
            </p>
            <p className="caption">
              A estimativa é aproximada e pode errar bastante. Se o seu objetivo é perder peso, manter a meta sem soma costuma ser mais
              seguro.
            </p>
            <div className="stack">
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const ok = await save({ workoutAddToGoal: true });
                  setBusy(false);
                  if (ok) setConfirming(false);
                }}
              >
                {busy ? <span className="spinner" aria-label="Salvando" /> : 'Somar à meta'}
              </button>
              <button type="button" className="btn btn-plain btn-block" onClick={() => setConfirming(false)} disabled={busy}>
                Agora não
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

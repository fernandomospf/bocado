'use client';

import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import { GLP1_ABOUT, GLP1_ADAPTIVE_PAUSED, GLP1_REFERENCE_NOTE } from '@/lib/glp1';
import type { Profile } from '@/lib/types';
import { useToast } from './Toast';

/**
 * Perfil > Preferências > "Uso de GLP-1" (oculto para menores de 18 anos). O Bocado só ajusta a interface (proteína,
 * água, bem-estar) e pausa a meta adaptativa; não orienta sobre a medicação.
 */
export function Glp1Prefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();
  const [busy, setBusy] = useState(false);
  const [floor, setFloor] = useState('');

  useEffect(() => {
    if (profile?.proteinFloorG != null) setFloor(String(profile.proteinFloorG));
  }, [profile?.proteinFloorG]);

  if (!profile || profile.age < 18) return null;

  async function save(patch: { glp1Mode?: boolean; proteinFloorG?: number | null }) {
    setBusy(true);
    tap();
    try {
      const updated = await api<Profile>('/profile/preferences', { method: 'PATCH', json: patch });
      await mutate(updated, { revalidate: false });
      void globalMutate((k) => typeof k === 'string' && (k.startsWith('/adaptive') || k.startsWith('/glp1') || k.startsWith('/wellbeing')));
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  const floorNum = Number(floor);
  const floorValid = Number.isInteger(floorNum) && floorNum >= 30 && floorNum <= 300;

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }} id="glp1">
        Uso de GLP-1
      </h3>
      <label className="switch-row">
        <span>Estou usando um medicamento GLP-1</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.glp1Mode}
          disabled={busy}
          onChange={(e) => void save({ glp1Mode: e.target.checked })}
        />
      </label>
      <p className="caption">{GLP1_ABOUT}</p>

      {profile.glp1Mode && (
        <>
          <label className="field">
            <span className="field-label">Piso de proteína (g por dia)</span>
            <div className="input-suffix">
              <input
                className="input num"
                inputMode="numeric"
                value={floor}
                placeholder={String(profile.proteinFloorSuggestion ?? '')}
                onChange={(e) => setFloor(e.target.value.replace(/\D/g, '').slice(0, 3))}
              />
              <span>g</span>
            </div>
          </label>
          <p className="caption">
            Sugestão: {profile.proteinFloorSuggestion} g. {GLP1_REFERENCE_NOTE}
          </p>
          <div className="grid-2">
            <button
              type="button"
              className="btn btn-glass"
              disabled={busy || !floorValid || floorNum === profile.proteinFloorG}
              onClick={() => void save({ proteinFloorG: floorNum })}
            >
              Salvar piso
            </button>
            <button
              type="button"
              className="btn btn-plain"
              disabled={busy}
              onClick={() => {
                setFloor('');
                void save({ proteinFloorG: null });
              }}
            >
              Usar a sugestão
            </button>
          </div>
          <p className="caption">{GLP1_ADAPTIVE_PAUSED}</p>
        </>
      )}
    </>
  );
}

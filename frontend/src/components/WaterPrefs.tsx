'use client';

import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/date';
import { parseNum } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { useProfile, useWaterDay } from '@/lib/hooks';
import type { Profile } from '@/lib/types';
import { fmtMl } from '@/lib/water';
import { useToast } from './Toast';

type Patch = Partial<Pick<Profile, 'waterEnabled' | 'waterGoalMode' | 'waterGoalManualMl' | 'waterBottleMl'>>;

/** Perfil > Preferências > Água: ligar o contador, meta automática ou manual, garrafa e a explicação da meta de hoje. */
export function WaterPrefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();
  const { data: day } = useWaterDay(todayISO(), profile?.waterEnabled ?? false);
  const [manual, setManual] = useState('');
  const [bottle, setBottle] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setManual(profile.waterGoalManualMl ? String(profile.waterGoalManualMl) : '');
    setBottle(profile.waterBottleMl ? String(profile.waterBottleMl) : '');
  }, [profile?.waterGoalManualMl, profile?.waterBottleMl]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile) return null;
  const under18 = profile.age < 18;
  const mode = under18 ? 'MANUAL' : profile.waterGoalMode;

  async function save(patch: Patch) {
    if (!profile) return false;
    tap();
    setError(null);
    try {
      // Otimista: o interruptor responde na hora; em erro, volta ao valor do servidor
      await mutate(async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: patch }), {
        optimisticData: { ...profile, ...patch },
        rollbackOnError: true,
        revalidate: false,
      });
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/water'));
      return true;
    } catch (err) {
      setError(errorMessage(err));
      toast.show({ message: errorMessage(err), tone: 'error' });
      return false;
    }
  }

  async function saveManual() {
    const ml = Math.round(parseNum(manual));
    if (!(ml >= 1000 && ml <= 5000)) return setError('A meta de água precisa ficar entre 1.000 e 5.000 ml.');
    await save({ waterGoalMode: 'MANUAL', waterGoalManualMl: ml });
  }

  async function saveBottle() {
    if (!bottle.trim()) return void (await save({ waterBottleMl: null }));
    const ml = Math.round(parseNum(bottle));
    if (!(ml >= 100 && ml <= 2000)) return setError('A garrafa precisa ter entre 100 e 2.000 ml.');
    await save({ waterBottleMl: ml });
  }

  return (
    <div className="stack" id="agua" style={{ scrollMarginTop: 80 }}>
      <h3 className="headline" style={{ marginTop: 6 }}>
        Água
      </h3>
      <label className="switch-row">
        <span>Mostrar contador de água</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.waterEnabled}
          onChange={(e) => void save({ waterEnabled: e.target.checked })}
        />
      </label>

      {profile.waterEnabled && (
        <>
          <div className="segmented" role="group" aria-label="Como calcular a meta de água">
            <button type="button" aria-pressed={mode === 'AUTO'} disabled={under18} onClick={() => void save({ waterGoalMode: 'AUTO' })}>
              Automática
            </button>
            <button type="button" aria-pressed={mode === 'MANUAL'} onClick={() => void save({ waterGoalMode: 'MANUAL' })}>
              Manual
            </button>
          </div>
          {under18 && <p className="caption">Para menores de 18 anos, defina a sua própria meta de água.</p>}

          {mode === 'MANUAL' && (
            <div className="grid-2" style={{ alignItems: 'end' }}>
              <label className="field">
                <span className="field-label">Meta diária</span>
                <div className="input-suffix">
                  <input className="input num" inputMode="numeric" value={manual} placeholder="Ex.: 2500" onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} />
                  <span>ml</span>
                </div>
              </label>
              <button type="button" className="btn btn-glass" onClick={() => void saveManual()} disabled={!manual}>
                Salvar meta
              </button>
            </div>
          )}

          <div className="grid-2" style={{ alignItems: 'end' }}>
            <label className="field">
              <span className="field-label">Tamanho da garrafa (opcional)</span>
              <div className="input-suffix">
                <input className="input num" inputMode="numeric" value={bottle} placeholder="Ex.: 500" onChange={(e) => setBottle(e.target.value.replace(/\D/g, ''))} />
                <span>ml</span>
              </div>
            </label>
            <button type="button" className="btn btn-glass" onClick={() => void saveBottle()}>
              Salvar garrafa
            </button>
          </div>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          {day && day.goalMl !== null && (
            <div className="stack" style={{ gap: 4 }}>
              <p className="body-2 num">Meta de hoje: {fmtMl(day.goalMl)} ml</p>
              <p className="caption">
                {day.goalSource === 'manual'
                  ? 'Você está usando a sua própria meta.'
                  : `35 ml por kg do seu peso (tendência dos últimos 7 dias)${day.explain.workoutMl ? ', mais 10 ml por minuto de treino' : ''}. É uma referência geral: sua necessidade pode variar. Se você tem orientação médica para limitar líquidos, desligue o contador ou defina a sua própria meta.`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

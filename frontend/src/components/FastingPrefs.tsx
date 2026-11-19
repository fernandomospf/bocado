'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { FASTING_WARNING } from '@/lib/fasting';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import type { Profile } from '@/lib/types';
import { useToast } from './Toast';

/**
 * Perfil > Preferências > Jejum intermitente (oculto para menores de 18 anos). O interruptor só destrava depois de a
 * pessoa confirmar que leu o aviso. O Bocado só registra a janela; não indica nem prescreve jejum.
 */
export function FastingPrefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!profile || profile.age < 18) return null;

  async function save(fastingEnabled: boolean) {
    setBusy(true);
    tap();
    try {
      const updated = await api<Profile>('/profile/preferences', { method: 'PATCH', json: { fastingEnabled } });
      await mutate(updated, { revalidate: false });
      void globalMutate((k) => typeof k === 'string' && k.startsWith('/fasting'));
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }} id="jejum">
        Jejum intermitente
      </h3>
      <p className="caption">{FASTING_WARNING}</p>
      {!profile.fastingEnabled && (
        <label className="check-row">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
          <span>Li o aviso acima</span>
        </label>
      )}
      <label className="switch-row">
        <span>Registrar minhas janelas de jejum</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.fastingEnabled}
          disabled={busy || (!profile.fastingEnabled && !read)}
          onChange={(e) => void save(e.target.checked)}
        />
      </label>
      <p className="caption">Desligado por padrão. O que você registrar fica só na sua conta e é apagado com ela.</p>
    </>
  );
}

'use client';

import { useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import type { Profile } from '@/lib/types';
import { KEYBOARD_HELP_EVENT } from './KeyboardHelp';
import { useToast } from './Toast';

type Key = 'a11yHighContrast' | 'a11yReduceTransparency' | 'a11yReduceMotion';

const OPTIONS: { key: Key; label: string; help: string }[] = [
  { key: 'a11yHighContrast', label: 'Alto contraste', help: 'Bordas mais fortes, sem transparência e texto secundário mais escuro.' },
  { key: 'a11yReduceTransparency', label: 'Reduzir transparência', help: 'Troca o vidro translúcido por fundos sólidos.' },
  { key: 'a11yReduceMotion', label: 'Reduzir animações', help: 'Para as animações dos medidores, da chama, da gota e das transições.' },
];

/** Perfil > Preferências > Acessibilidade. Salvo no perfil e aplicado na hora (sem recarregar). */
export function A11yPrefs() {
  const toast = useToast();
  const { data: profile, mutate } = useProfile();
  const [busy, setBusy] = useState(false);
  if (!profile) return null;

  async function toggle(key: Key, value: boolean) {
    setBusy(true);
    tap();
    try {
      const updated = await api<Profile>('/profile/preferences', { method: 'PATCH', json: { [key]: value } });
      await mutate(updated, { revalidate: false });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }} id="acessibilidade">
        Acessibilidade
      </h3>
      {OPTIONS.map((o) => (
        <div key={o.key} className="stack-sm">
          <label className="switch-row">
            <span>{o.label}</span>
            <input type="checkbox" role="switch" className="switch" checked={profile[o.key]} disabled={busy} aria-describedby={`${o.key}-help`} onChange={(e) => void toggle(o.key, e.target.checked)} />
          </label>
          <p className="caption" id={`${o.key}-help`}>
            {o.help}
          </p>
        </div>
      ))}
      <button type="button" className="btn btn-glass btn-block" onClick={() => window.dispatchEvent(new Event(KEYBOARD_HELP_EVENT))}>
        Atalhos de teclado
      </button>
      <p className="caption">O Bocado também segue o que o seu aparelho já pede (contraste, transparência e movimento).</p>
    </>
  );
}

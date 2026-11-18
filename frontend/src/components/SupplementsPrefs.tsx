'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import { SUPPLEMENTS_PRINCIPLES, SUPPLEMENTS_PRIVACY } from '@/lib/supplements';
import { isSupplementKey } from '@/lib/useSupplements';
import type { Profile } from '@/lib/types';
import { CapsuleIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** As três linhas de privacidade da tela de ativação. */
const PRIVACY_LINES = [
  SUPPLEMENTS_PRIVACY,
  'Não é enviado à IA e não entra em relatórios, análises nem estatísticas de uso.',
  'Fica só na sua conta e é apagado quando você exclui a conta.',
];

/**
 * Perfil > Suplementos e medicações (oculto para menores de 18 anos). Desligado por padrão; ao ligar, uma folha mostra
 * o texto fixo de princípios e a privacidade. Ligado: "Gerenciar" e "Mostrar nomes na tela Hoje".
 */
export function SupplementsPrefs() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate } = useProfile();
  const [activating, setActivating] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!profile || profile.age < 18) return null;

  async function save(patch: Partial<Pick<Profile, 'supplementsEnabled' | 'supplementsMaskNamesOnHome'>>) {
    setBusy(true);
    tap();
    try {
      const updated = await api<Profile>('/profile/preferences', { method: 'PATCH', json: patch });
      await mutate(updated, { revalidate: false });
      void globalMutate(isSupplementKey);
      return true;
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h3 className="headline" style={{ marginTop: 6 }} id="suplementos">
        Suplementos e medicações
      </h3>
      <label className="switch-row">
        <span>Ativar registro de suplementos e medicações</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={profile.supplementsEnabled}
          disabled={busy}
          onChange={(e) => (e.target.checked ? setActivating(true) : void save({ supplementsEnabled: false }))}
        />
      </label>
      {!profile.supplementsEnabled && <p className="caption">Um registro pessoal do que você toma. Desligado por padrão.</p>}

      {profile.supplementsEnabled && (
        <>
          <Link href="/supplements" className="btn btn-glass btn-block">
            <CapsuleIcon width={20} height={20} />
            Gerenciar
          </Link>
          <label className="switch-row">
            <span>Mostrar nomes na tela Hoje</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={!profile.supplementsMaskNamesOnHome}
              disabled={busy}
              onChange={(e) => void save({ supplementsMaskNamesOnHome: !e.target.checked })}
            />
          </label>
          <p className="caption">
            {profile.supplementsMaskNamesOnHome ? 'A Hoje mostra "Medicação 1" ou "Suplemento 2" no lugar do nome.' : 'Desligue para a Hoje mostrar só "Medicação" ou "Suplemento".'} Ao desligar o registro, o que você
            cadastrou fica guardado até você apagar.
          </p>
        </>
      )}

      <Sheet open={activating} title="Suplementos e medicações" onClose={() => setActivating(false)}>
        <div className="stack-lg">
          <h2 className="title">Suplementos e medicações</h2>
          <p className="body-2">{SUPPLEMENTS_PRINCIPLES}</p>
          <ul className="stack-sm" style={{ paddingLeft: 18, margin: 0 }}>
            {PRIVACY_LINES.map((line) => (
              <li key={line} className="body-2">
                {line}
              </li>
            ))}
          </ul>
          <div className="stack">
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={busy}
              onClick={async () => {
                if (await save({ supplementsEnabled: true })) setActivating(false);
              }}
            >
              Ativar
            </button>
            <button type="button" className="btn btn-plain btn-block" onClick={() => setActivating(false)}>
              Agora não
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

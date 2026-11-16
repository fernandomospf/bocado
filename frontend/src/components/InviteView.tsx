'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, api, errorMessage } from '@/lib/api';
import { useMe } from '@/lib/hooks';
import { INVITE_CODE_RE, normalizeInviteCode, savePendingInvite } from '@/lib/invite';
import type { Household, InvitePreview } from '@/lib/types';
import { Logo } from './Logo';
import { useToast } from './Toast';

/** Rota pública /convite/[code]: mostra quem convidou e leva a entrar na casa (ou a entrar/criar conta antes). */
export function InviteView({ rawCode }: { rawCode: string }) {
  const router = useRouter();
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const code = normalizeInviteCode(rawCode);
  const valid = INVITE_CODE_RE.test(code);

  const { data: preview, error: previewError } = useSWR<InvitePreview>(valid ? `/invites/${code}/preview` : null, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  const { data: me, error: meError } = useMe();
  const loggedOut = meError instanceof ApiError && meError.status === 401;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guarda o código assim que o convite se mostra válido para quem ainda não entrou: o login com Google
  // faz redirect externo e a query string se perde, o localStorage não.
  useEffect(() => {
    if (preview && loggedOut) savePendingInvite(code);
  }, [preview, loggedOut, code]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const house = await api<Household>('/household/join', { method: 'POST', json: { code } });
      await globalMutate((key) => typeof key === 'string' && (key.startsWith('/household') || key.startsWith('/recipes')));
      toast.show({ message: `Você entrou na casa ${house.name}`, durationMs: 4000 });
      router.replace('/profile');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const invalid = !valid || (previewError instanceof ApiError && previewError.status === 404);
  const loading = !invalid && !preview && !previewError;

  return (
    <main className="screen screen-plain screen-center">
      <div className="card glass stack-lg" style={{ textAlign: 'center', maxWidth: 420, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <Logo size={44} />
        </div>

        {loading && <span className="spinner" aria-label="Carregando" style={{ alignSelf: 'center' }} />}

        {invalid && (
          <>
            <p className="headline">Convite inválido ou expirado</p>
            <p className="body-2">Peça um novo convite para quem criou a casa.</p>
            <Link href="/" className="btn btn-glass btn-block">
              Ir para o Bocado
            </Link>
          </>
        )}

        {previewError && !invalid && <p className="alert" role="alert">{previewError.message}</p>}

        {preview && (
          <>
            <div className="stack" style={{ gap: 6 }}>
              <p className="title">
                {preview.inviterFirstName} convidou você para a casa {preview.householdName}
              </p>
              <p className="body-2">
                Quem está na casa vê só o seu nome, a sua foto e as receitas que você compartilhar. O seu diário, as
                metas e o peso ficam só com você.
              </p>
            </div>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            {me && (
              <button className="btn btn-primary btn-block" disabled={busy} onClick={join}>
                {busy ? <span className="spinner" aria-label="Entrando" /> : 'Entrar na casa'}
              </button>
            )}

            {loggedOut && (
              <div className="stack">
                <Link href="/login" className="btn btn-primary btn-block" onClick={() => savePendingInvite(code)}>
                  Entrar
                </Link>
                <Link href="/register" className="btn btn-glass btn-block" onClick={() => savePendingInvite(code)}>
                  Criar conta
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

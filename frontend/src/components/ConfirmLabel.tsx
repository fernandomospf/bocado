'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useToast } from './Toast';

interface Verification {
  verifyCount: number;
  verified: boolean;
  confirmedByMe: boolean;
  ownProduct: boolean;
}

/**
 * Botão discreto "Os valores conferem com o rótulo" (um por pessoa; o criador do produto não vê, porque não conta).
 * Com 2 ou mais pessoas diferentes o produto ganha o selo "Verificado".
 */
export function ConfirmLabel({ foodId }: { foodId: string }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const key = `/foods/${foodId}/verification`;
  const { data } = useSWR<Verification>(key, { revalidateOnFocus: false });
  const [busy, setBusy] = useState(false);
  if (!data || data.ownProduct) return null;

  if (data.confirmedByMe) return <p className="caption">Você confirmou que os valores conferem. Obrigado!</p>;

  async function confirm() {
    setBusy(true);
    tap();
    try {
      await api(`/foods/${foodId}/confirm`, { method: 'POST' });
      await mutate(key);
      void mutate((k) => typeof k === 'string' && k.startsWith('/foods/search'));
      toast.show({ message: 'Obrigado por conferir!' });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className="btn btn-plain btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} disabled={busy} onClick={confirm}>
      Os valores conferem com o rótulo
    </button>
  );
}

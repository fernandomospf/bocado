'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useDay, useFavorites } from '@/lib/hooks';
import { RETURN_DISMISS_KEY, returnCardVisible, type LastLog } from '@/lib/returnCard';
import { tap } from '@/lib/haptics';
import { useQuickMeals } from '@/lib/quickMeals';
import { useSpeechSupported } from '@/lib/speech';
import { RepeatIcon, MicIcon, ImageIcon } from './Icons';
import { Sheet } from './Sheet';

/**
 * "Que bom te ver por aqui": só na Hoje, depois de 3 dias ou mais sem registro. Acolhe e oferece um começo fácil (o café);
 * some ao registrar algo ou ao dispensar (uma vez por retorno). Nada de cobrança, sequência ou contagem de dias perdidos.
 */
export function ReturnCard({ date }: { date: string }) {
  const { data: last } = useSWR<LastLog>(`/meals/last-log?today=${date}`, { revalidateOnFocus: false });
  const { data: day } = useDay(date);
  const { data: favorites } = useFavorites();
  const quick = useQuickMeals();
  const canSpeak = useSpeechSupported();
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    try {
      setDismissedFor(window.localStorage.getItem(RETURN_DISMISS_KEY));
    } catch {
      setDismissedFor(null);
    }
    setReady(true);
  }, []);

  const loggedToday = (day?.meals ?? []).some((m) => m.items.length > 0);
  if (!ready || !returnCardVisible({ last, loggedToday, dismissedFor })) return null;

  function dismiss() {
    tap();
    const value = last?.lastLogDate ?? null;
    try {
      if (value) window.localStorage.setItem(RETURN_DISMISS_KEY, value);
    } catch {
      // Sem armazenamento: dispensa só nesta sessão
    }
    setDismissedFor(value);
  }

  const addHref = `/add?type=BREAKFAST&date=${date}`;
  return (
    <section className="card glass stack return-card" aria-label="Boas-vindas">
      <div>
        <h2 className="headline">Que bom te ver por aqui</h2>
        <p className="body-2">Quer começar pelo café?</p>
      </div>
      <div className="return-actions">
        {favorites && favorites.length > 0 && (
          <button type="button" className="empty-add" onClick={() => setPicking(true)}>
            <RepeatIcon width={18} height={18} />
            Repetir um favorito
          </button>
        )}
        <Link href={addHref} className="empty-add">
          <ImageIcon width={18} height={18} />
          Buscar alimento
        </Link>
        {canSpeak && (
          <Link href={`${addHref}&voice=1`} className="empty-add">
            <MicIcon width={18} height={18} />
            Falar refeição
          </Link>
        )}
      </div>
      <button type="button" className="btn btn-plain btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={dismiss}>
        Agora não
      </button>

      <Sheet open={picking} title="Repetir um favorito" onClose={() => setPicking(false)}>
        <div className="stack-lg">
          <h2 className="title">Repetir um favorito</h2>
          <p className="caption">Entra no café da manhã de hoje.</p>
          <div className="list">
            {(favorites ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                className="list-row"
                onClick={async () => {
                  setPicking(false);
                  await quick.logFavorite(f.id, date, 'BREAKFAST');
                }}
              >
                <span className="list-row-main">
                  <span className="list-row-title">{f.name}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Sheet>
    </section>
  );
}

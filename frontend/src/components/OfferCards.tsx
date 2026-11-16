'use client';

import { useState } from 'react';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtDec, fmtInt } from '@/lib/format';
import { useSharedOffers } from '@/lib/hooks';
import { MEAL_LABEL } from '@/lib/labels';
import { useOfferActions } from '@/lib/sharedMeals';
import type { SharedOffer } from '@/lib/types';
import { Avatar } from './Avatar';

const MAX_VISIBLE = 3;
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Refeições que alguém da casa dividiu com você: cada uma é uma oferta (nada entra no diário sem aceitar). */
export function OfferCards() {
  const { data } = useSharedOffers();
  const { accept, dismiss } = useOfferActions();
  const { hideCalories: hide } = useDisplayPrefs();
  const [busyId, setBusyId] = useState<string | null>(null);
  if (!data || data.length === 0) return null;

  const visible = data.slice(0, MAX_VISIBLE);
  const hidden = data.length - visible.length;

  async function act(offer: SharedOffer, run: () => Promise<void>) {
    if (busyId) return;
    setBusyId(offer.id);
    try {
      await run();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="stack" style={{ gap: 10 }} aria-label="Refeições divididas com você">
      {visible.map((o) => (
        <article key={o.id} className="card glass stack" style={{ gap: 10 }}>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <Avatar name={o.from.name} url={o.from.avatarUrl} />
            <div style={{ minWidth: 0 }}>
              <p className="headline">
                {firstName(o.from.name)} dividiu {MEAL_LABEL[o.type].toLowerCase()} com você
              </p>
              <p className="caption num">
                {hide ? '' : `${fmtInt(o.totals.kcal)} kcal · `}P {fmtDec(o.totals.protein)}g · C {fmtDec(o.totals.carbs)}g · G{' '}
                {fmtDec(o.totals.fat)}g
              </p>
              {o.items.length > 0 && (
                <p className="caption" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.items.map((i) => i.name).join(', ')}
                </p>
              )}
            </div>
          </div>
          <div className="suggestion-actions">
            <button className="btn btn-primary btn-sm" disabled={busyId !== null} onClick={() => void act(o, () => accept(o))}>
              Adicionar
            </button>
            <button className="btn btn-glass btn-sm" disabled={busyId !== null} onClick={() => void act(o, () => dismiss(o))}>
              Ignorar
            </button>
          </div>
          <button
            type="button"
            className="btn btn-plain btn-sm"
            style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
            disabled={busyId !== null}
            onClick={() => void act(o, () => accept(o, true))}
          >
            Sempre aceitar da casa
          </button>
        </article>
      ))}
      {hidden > 0 && (
        <p className="caption" style={{ textAlign: 'center' }}>
          +{hidden} {hidden === 1 ? 'oferta' : 'ofertas'}
        </p>
      )}
    </section>
  );
}

'use client';

import { useId } from 'react';
import { fmtInt } from '@/lib/format';
import { useHousehold, useMe } from '@/lib/hooks';
import { adjustShare, equalShares, STEP_PCT, twoWay } from '@/lib/split';
import type { SplitShares } from '@/lib/sharedMeals';
import { Avatar } from './Avatar';

/** Estado do seletor. `shares` só tem quem participa (você incluído). */
export interface SplitState {
  on: boolean;
  shares: SplitShares;
}

export const NO_SPLIT: SplitState = { on: false, shares: {} };

/** Divisão pronta para enviar: ligada e com pelo menos mais uma pessoa. */
export const splitReady = (s: SplitState) => s.on && Object.keys(s.shares).length >= 2;
/** Ligada, mas ainda sem ninguém escolhido (bloqueia o salvar). */
export const splitIncomplete = (s: SplitState) => s.on && Object.keys(s.shares).length < 2;

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

interface SplitPickerProps {
  value: SplitState;
  onChange: (next: SplitState) => void;
  /** kcal da refeição inteira, para a prévia "Você: 540 kcal · Ana: 360 kcal". */
  totalKcal: number;
}

/** "Dividir com a casa": escolha de pessoas e porções. Só aparece se a casa tiver mais de um membro. */
export function SplitPicker({ value, onChange, totalKcal }: SplitPickerProps) {
  const { data: house } = useHousehold();
  const { data: me } = useMe();
  const id = useId();
  if (!house || !me || house.members.length < 2) return null;

  const others = house.members.filter((m) => m.id !== me.id);
  const nameOf = (uid: string) => (uid === me.id ? 'Você' : firstName(house.members.find((m) => m.id === uid)?.name ?? ''));
  const ids = Object.keys(value.shares);
  const orderedIds = [me.id, ...others.map((o) => o.id)].filter((k) => k in value.shares);

  function toggleOn(on: boolean) {
    if (!on) return onChange({ on: false, shares: {} });
    // Com uma única outra pessoa na casa, já vem escolhida e dividida ao meio
    const picked = others.length === 1 ? [me!.id, others[0].id] : [me!.id];
    onChange({ on: true, shares: picked.length > 1 ? equalShares(picked) : { [me!.id]: 100 } });
  }

  function togglePerson(uid: string) {
    const current = new Set(ids);
    if (current.has(uid)) current.delete(uid);
    else current.add(uid);
    const next = [me!.id, ...others.map((o) => o.id)].filter((k) => current.has(k));
    onChange({ on: true, shares: next.length > 1 ? equalShares(next) : { [me!.id]: 100 } });
  }

  const set = (shares: SplitShares) => onChange({ on: true, shares });
  const two = orderedIds.length === 2 ? orderedIds : null;

  return (
    <section className="card glass stack split-picker" aria-label="Dividir com a casa">
      <label className="switch-row">
        <span>
          Dividir com a casa
          <span className="caption" style={{ display: 'block' }}>
            A outra pessoa recebe a parte dela e escolhe se adiciona.
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={value.on}
          onChange={(e) => toggleOn(e.target.checked)}
        />
      </label>

      {value.on && (
        <>
          <div className="stack" style={{ gap: 6 }} role="group" aria-label="Com quem dividir">
            {others.map((o) => (
              <label key={o.id} className="list-row" htmlFor={`${id}-${o.id}`} style={{ cursor: 'pointer' }}>
                <Avatar name={o.name} url={o.avatarUrl} />
                <span className="list-row-main">{firstName(o.name)}</span>
                <input
                  id={`${id}-${o.id}`}
                  type="checkbox"
                  checked={o.id in value.shares}
                  onChange={() => togglePerson(o.id)}
                />
              </label>
            ))}
          </div>

          {ids.length < 2 && <p className="caption">Escolha pelo menos uma pessoa para dividir.</p>}

          {ids.length >= 2 && (
            <>
              <div className="chip-strip" role="group" aria-label="Atalhos de divisão">
                <button type="button" className="chip" onClick={() => set(equalShares(orderedIds))}>
                  Igual
                </button>
                {two && (
                  <>
                    <button type="button" className="chip" onClick={() => set(twoWay(two[0], two[1], 60))}>
                      60/40
                    </button>
                    <button type="button" className="chip" onClick={() => set(twoWay(two[0], two[1], 70))}>
                      70/30
                    </button>
                  </>
                )}
              </div>

              <div className="stack" style={{ gap: 8 }}>
                {orderedIds.map((uid) => (
                  <div key={uid} className="spread" role="group" aria-label={`Parte de ${nameOf(uid)}`}>
                    <span>{nameOf(uid)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        type="button"
                        className="btn btn-glass btn-icon btn-sm"
                        aria-label={`Menos ${STEP_PCT}% para ${nameOf(uid)}`}
                        onClick={() => set(adjustShare(value.shares, uid, -STEP_PCT))}
                      >
                        −
                      </button>
                      <strong className="num" style={{ minWidth: 44, textAlign: 'center' }}>
                        {value.shares[uid]}%
                      </strong>
                      <button
                        type="button"
                        className="btn btn-glass btn-icon btn-sm"
                        aria-label={`Mais ${STEP_PCT}% para ${nameOf(uid)}`}
                        onClick={() => set(adjustShare(value.shares, uid, STEP_PCT))}
                      >
                        +
                      </button>
                    </span>
                  </div>
                ))}
              </div>

              <p className="body-2 num" aria-live="polite">
                {orderedIds.map((uid) => `${nameOf(uid)}: ${fmtInt((totalKcal * value.shares[uid]) / 100)} kcal`).join(' · ')}
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}

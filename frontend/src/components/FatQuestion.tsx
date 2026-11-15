'use client';

import { useId } from 'react';
import { type FatChoice, type FatQuestionState, guessText } from '@/lib/preparationFat';
import type { FatLevel, FatRefKind } from '@/lib/types';

const LEVELS: { value: FatLevel; label: string }[] = [
  { value: 'none', label: 'Nada' },
  { value: 'little', label: 'Um pouco' },
  { value: 'lots', label: 'Bastante' },
];

const KINDS: { value: FatRefKind; label: string }[] = [
  { value: 'oil', label: 'Óleo' },
  { value: 'butter', label: 'Manteiga' },
  { value: 'sauce', label: 'Molho' },
];

interface FatQuestionProps {
  state: FatQuestionState;
  onChange: (patch: Partial<FatChoice>) => void;
}

/** "Teve óleo, manteiga ou molho no preparo?": um toque confirma ou corrige o palpite da IA. */
export function FatQuestion({ state, onChange }: FatQuestionProps) {
  const id = useId();
  const { choice, guess } = state;
  return (
    <section className="fat-question card glass" aria-labelledby={`${id}-q`}>
      <div>
        <p className="headline" id={`${id}-q`}>
          Teve óleo, manteiga ou molho no preparo?
        </p>
        <p className="caption">
          {guessText(guess)}
          {guess.reason ? ` (${guess.reason})` : ''}
        </p>
      </div>

      <div className="fat-chips" role="group" aria-label="Quanto">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            className="chip fat-chip"
            aria-pressed={choice.level === l.value}
            onClick={() => choice.level !== l.value && onChange({ level: l.value })}
          >
            {l.label}
          </button>
        ))}
      </div>

      {choice.level !== 'none' && (
        <div className="fat-chips fade-in" role="group" aria-label="Tipo de gordura">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              className="chip fat-chip"
              aria-pressed={choice.kind === k.value}
              onClick={() => choice.kind !== k.value && onChange({ kind: k.value })}
            >
              {k.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

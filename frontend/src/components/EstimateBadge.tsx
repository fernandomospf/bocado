'use client';

import { useId, useState } from 'react';

export const ESTIMATE_TEXT =
  'Valor estimado pela IA a partir da foto ou descrição. Confira a porção se precisar de precisão.';

/**
 * Selo discreto "estimativa"; ao tocar, mostra a explicação logo abaixo.
 * Devolve dois irmãos (selo e texto): o pai precisa ser flex com quebra de linha (`.estimate-host`).
 */
export function EstimateBadge() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        className="badge badge-estimate"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        estimativa
      </button>
      <p id={id} className="estimate-tip" hidden={!open}>
        {ESTIMATE_TEXT}
      </p>
    </>
  );
}

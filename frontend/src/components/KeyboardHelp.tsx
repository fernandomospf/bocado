'use client';

import { useEffect, useState } from 'react';
import { Sheet } from './Sheet';

export const KEYBOARD_HELP_EVENT = 'bocado:keyboard-help';

const ROWS: { keys: string; what: string }[] = [
  { keys: 'N', what: 'Nova refeição' },
  { keys: 'T', what: 'Registrar treino' },
  { keys: 'W', what: 'Registrar água (com o contador ligado)' },
  { keys: '←  →', what: 'Dia anterior e próximo, na tela Hoje' },
  { keys: '?', what: 'Abrir esta ajuda' },
  { keys: 'Esc', what: 'Fechar uma folha ou um menu' },
];

/** Ajuda dos atalhos de teclado (desktop). As teclas de uma letra ficam desativadas dentro de campos de texto. */
export function KeyboardHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(KEYBOARD_HELP_EVENT, show);
    return () => window.removeEventListener(KEYBOARD_HELP_EVENT, show);
  }, []);
  return (
    <Sheet open={open} title="Atalhos de teclado" onClose={() => setOpen(false)}>
      <div className="stack-lg">
        <div>
          <h2 className="title">Atalhos de teclado</h2>
          <p className="caption">Funcionam com mouse ou teclado físico, e não disparam enquanto você digita num campo.</p>
        </div>
        <dl className="kbd-list">
          {ROWS.map((r) => (
            <div key={r.keys} className="kbd-row">
              <dt>
                <kbd>{r.keys}</kbd>
              </dt>
              <dd>{r.what}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Sheet>
  );
}

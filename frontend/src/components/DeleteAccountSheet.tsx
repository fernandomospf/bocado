'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useId, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const CONFIRM_WORD = 'EXCLUIR';

interface DeleteAccountSheetProps {
  open: boolean;
  hasPassword: boolean;
  onClose: () => void;
  /** Fecha a folha e leva até o card de exportação. */
  onExportFirst: () => void;
}

/** Exclusão definitiva da conta (LGPD): explica, sugere exportar antes e pede senha + "EXCLUIR". */
export function DeleteAccountSheet({ open, hasPassword, onClose, onExportFirst }: DeleteAccountSheetProps) {
  const id = useId();
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = confirmation === CONFIRM_WORD && (!hasPassword || password.length > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api('/account', {
        method: 'DELETE',
        json: { confirmation, ...(hasPassword ? { password } : {}) },
      });
      // Nada da conta apagada pode sobrar no cache
      await mutate(() => true, undefined, { revalidate: false });
      toast.show({ message: 'Sua conta foi excluída' });
      router.replace('/login');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Excluir conta" onClose={onClose}>
      <form className="stack-lg" onSubmit={submit}>
        <div className="stack" style={{ gap: 8 }}>
          <h2 className="title">Excluir conta</h2>
          <ul className="danger-list">
            <li>Apagamos seu perfil, metas, refeições, registros de peso e receitas.</li>
            <li>Produtos que você cadastrou no acervo continuam, sem o seu nome.</li>
            <li>Não dá para desfazer.</li>
          </ul>
        </div>

        <button type="button" className="btn btn-glass btn-block" onClick={onExportFirst}>
          Exportar meus dados antes
        </button>

        {hasPassword && (
          <label className="field">
            <span className="field-label">Sua senha</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span className="field-label" id={`${id}-confirm`}>
            Digite {CONFIRM_WORD} para confirmar
          </span>
          <input
            className="input"
            aria-labelledby={`${id}-confirm`}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-block btn-destructive" disabled={!ready || busy}>
          {busy ? <span className="spinner" aria-label="Excluindo" /> : 'Excluir minha conta'}
        </button>
      </form>
    </Sheet>
  );
}

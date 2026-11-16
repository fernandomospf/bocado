'use client';

import { useId, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { useFavorites } from '@/lib/hooks';
import { MEAL_SHORT } from '@/lib/labels';
import { quickLabel } from '@/lib/quickMeals';
import type { Favorite } from '@/lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

/** Perfil: lista das refeições favoritas, com renomear e excluir. */
export function FavoritesSection() {
  const { hideCalories: hide } = useDisplayPrefs();
  const { data: favorites, error } = useFavorites();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [renaming, setRenaming] = useState<Favorite | null>(null);
  // Excluir em dois toques: o primeiro pede a confirmação no próprio botão
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function remove(f: Favorite) {
    if (confirmId !== f.id) {
      setConfirmId(f.id);
      return;
    }
    setConfirmId(null);
    try {
      await api(`/favorites/${f.id}`, { method: 'DELETE' });
      tap();
      await mutate('/favorites');
      toast.show({ message: 'Favorita excluída', durationMs: 2500 });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  return (
    <section className="card glass stack" aria-labelledby="favoritas-title">
      <h3 className="headline" id="favoritas-title">
        Refeições favoritas
      </h3>

      {error ? (
        <p className="alert" role="alert">
          {error.message}
        </p>
      ) : !favorites ? (
        <div className="skeleton" style={{ height: 52 }} />
      ) : favorites.length === 0 ? (
        <p className="body-2">
          Nenhuma ainda. Abra um alimento no Hoje e toque em &ldquo;Salvar refeição como favorita&rdquo;.
        </p>
      ) : (
        <ul className="list fav-list">
          {favorites.map((f) => (
            <li key={f.id} className="fav-row">
              <div className="list-row-main">
                <div className="list-row-title">{f.name}</div>
                <div className="list-row-sub">
                  {quickLabel(f.items)} · {hide ? `${fmtInt(f.totals.protein)} g de proteína` : `${fmtInt(f.totals.kcal)} kcal`}{f.type ? ` · ${MEAL_SHORT[f.type]}` : ''}
                </div>
              </div>
              <button type="button" className="btn btn-plain fav-action" onClick={() => setRenaming(f)}>
                Renomear
              </button>
              <button
                type="button"
                className="btn btn-plain btn-danger fav-action"
                onClick={() => void remove(f)}
                onBlur={() => setConfirmId((id) => (id === f.id ? null : id))}
              >
                {confirmId === f.id ? 'Confirmar' : 'Excluir'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <RenameSheet
          key={renaming.id}
          favorite={renaming}
          onClose={() => setRenaming(null)}
          onSaved={async () => {
            await mutate('/favorites');
            setRenaming(null);
          }}
        />
      )}
    </section>
  );
}

function RenameSheet({ favorite, onClose, onSaved }: { favorite: Favorite; onClose: () => void; onSaved: () => Promise<void> }) {
  const id = useId();
  const [name, setName] = useState(favorite.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && name.trim() !== favorite.name;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/favorites/${favorite.id}`, { method: 'PATCH', json: { name: name.trim() } });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Renomear favorita" onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) void save();
        }}
      >
        <label className="field" htmlFor={id}>
          <span className="field-label">Nome</span>
          <input id={id} className="input" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || !valid}>
          {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar'}
        </button>
      </form>
    </Sheet>
  );
}

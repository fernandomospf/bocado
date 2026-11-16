'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useHousehold } from '@/lib/hooks';
import type { Household, HouseholdInvite } from '@/lib/types';
import { Avatar } from './Avatar';
import { useToast } from './Toast';

export const PRIVACY_NOTE =
  'Quem está na casa vê só o seu nome, a sua foto e as receitas que você compartilhar. O seu diário, as metas e o peso ficam só com você.';

/** Perfil > Casa: criar, ver membros, convidar, preferências e sair. */
export function HouseholdSection() {
  const { data: household, error, mutate } = useHousehold();
  const { mutate: globalMutate } = useSWRConfig();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | string | null>(null);
  const isOwner = household?.me.role === 'OWNER';
  const { data: invites, mutate: mutateInvites } = useSWR<HouseholdInvite[]>(isOwner ? '/household/invites' : null);

  const refreshAll = () => {
    void globalMutate((key) => typeof key === 'string' && (key.startsWith('/recipes') || key.startsWith('/household')));
  };

  async function run<T>(action: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const result = await action();
      if (ok) toast.show({ message: ok, durationMs: 2500 });
      return result;
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function createHouse() {
    const created = await run(() => api<Household>('/household', { method: 'POST', json: { name: name.trim() } }));
    if (created) {
      await mutate(created, { revalidate: false });
      setName('');
    }
  }

  async function invite() {
    const created = await run(() => api<HouseholdInvite>('/household/invites', { method: 'POST' }));
    if (created) await mutateInvites();
  }

  async function revoke(id: string) {
    await run(() => api(`/household/invites/${id}`, { method: 'DELETE' }));
    await mutateInvites();
  }

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      tap();
      toast.show({ message: 'Link copiado', durationMs: 2000 });
    } catch {
      toast.show({ message: 'Não foi possível copiar. Selecione o link e copie.', tone: 'error' });
    }
  }

  async function share(i: HouseholdInvite) {
    try {
      await navigator.share({ title: 'Convite para a casa no Bocado', text: `Entre na casa ${household?.name} no Bocado`, url: i.link });
    } catch {
      /* cancelado pela pessoa */
    }
  }

  async function setAuto(autoAcceptShared: boolean) {
    if (!household) return;
    tap();
    await mutate(
      async () => {
        await api('/household/members/me', { method: 'PATCH', json: { autoAcceptShared } });
        return { ...household, me: { ...household.me, autoAcceptShared } };
      },
      { optimisticData: { ...household, me: { ...household.me, autoAcceptShared } }, rollbackOnError: true, revalidate: false },
    ).catch((err) => toast.show({ message: errorMessage(err), tone: 'error' }));
  }

  async function leave() {
    const done = await run(() => api('/household/members/me', { method: 'DELETE' }).then(() => true), 'Você saiu da casa');
    setConfirm(null);
    if (done) {
      await mutate(null, { revalidate: false });
      refreshAll();
    }
  }

  async function removeMember(userId: string, memberName: string) {
    const done = await run(
      () => api(`/household/members/${userId}`, { method: 'DELETE' }).then(() => true),
      `${memberName} saiu da casa`,
    );
    setConfirm(null);
    if (done) await mutate();
  }

  if (error) return <p className="alert" role="alert">{error.message}</p>;
  if (household === undefined) return <div className="skeleton" style={{ height: 96 }} />;

  if (household === null) {
    return (
      <section className="card glass stack">
        <p className="body-2">Crie uma casa para compartilhar receitas e dividir refeições com quem mora com você.</p>
        <label className="field">
          <span className="field-label">Nome da casa</span>
          <input
            className="input"
            placeholder="Ex.: Casa da Ana"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || name.trim().length < 2} onClick={createHouse}>
          Criar casa
        </button>
        <p className="caption">{PRIVACY_NOTE}</p>
      </section>
    );
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <section className="card glass stack">
      <div className="spread">
        <p className="title">{household.name}</p>
        <span className="caption">
          {household.members.length} de {household.maxMembers}
        </span>
      </div>

      <div className="list">
        {household.members.map((m) => (
          <div key={m.id} className="list-row">
            <Avatar name={m.name} url={m.avatarUrl} />
            <span className="list-row-main">
              {m.name}
              {m.role === 'OWNER' && <span className="caption"> · dono</span>}
            </span>
            {isOwner && m.role !== 'OWNER' &&
              (confirm === m.id ? (
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-glass btn-sm btn-danger" disabled={busy} onClick={() => void removeMember(m.id, m.name)}>
                    Remover
                  </button>
                  <button className="btn btn-plain btn-sm" onClick={() => setConfirm(null)}>
                    Cancelar
                  </button>
                </span>
              ) : (
                <button className="btn btn-plain btn-sm btn-danger" onClick={() => setConfirm(m.id)} aria-label={`Remover ${m.name}`}>
                  Remover
                </button>
              ))}
          </div>
        ))}
      </div>

      {isOwner && (
        <div className="stack" style={{ gap: 10 }}>
          <h3 className="headline">Convidar</h3>
          {(invites ?? []).map((i) => (
            <div key={i.id} className="card stack" style={{ gap: 8, padding: 12 }}>
              <div className="spread">
                <strong className="num" style={{ letterSpacing: 2 }}>
                  {i.code}
                </strong>
                <span className="caption">
                  até {new Date(i.expiresAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
              <p className="caption" style={{ wordBreak: 'break-all' }}>
                {i.link}
              </p>
              <div className="suggestion-actions">
                <button className="btn btn-glass btn-sm" onClick={() => void copy(i.link)}>
                  Copiar link
                </button>
                {canShare && (
                  <button className="btn btn-glass btn-sm" onClick={() => void share(i)}>
                    Compartilhar
                  </button>
                )}
                <button className="btn btn-plain btn-sm btn-danger" disabled={busy} onClick={() => void revoke(i.id)}>
                  Revogar
                </button>
              </div>
            </div>
          ))}
          <button
            className="btn btn-glass btn-block"
            disabled={busy || household.members.length >= household.maxMembers}
            onClick={invite}
          >
            Gerar convite
          </button>
          <p className="caption">Cada convite vale por 7 dias e serve para uma pessoa.</p>
        </div>
      )}

      <label className="switch-row">
        <span>Aceitar automaticamente refeições compartilhadas</span>
        <input
          type="checkbox"
          role="switch"
          className="switch"
          checked={household.me.autoAcceptShared}
          onChange={(e) => void setAuto(e.target.checked)}
        />
      </label>

      <p className="caption">{PRIVACY_NOTE}</p>

      {confirm === 'leave' ? (
        <div className="stack" style={{ gap: 8 }}>
          <p className="body-2">
            Ao sair, as suas receitas voltam a ser só suas e as ofertas pendentes são apagadas.
            {isOwner && household.members.length > 1 && ' A casa passa para o membro mais antigo.'}
          </p>
          <div className="grid-2">
            <button className="btn btn-glass" onClick={() => setConfirm(null)}>
              Cancelar
            </button>
            <button className="btn btn-glass btn-danger" disabled={busy} onClick={leave}>
              Sair da casa
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn-plain btn-danger" onClick={() => setConfirm('leave')}>
          Sair da casa
        </button>
      )}
    </section>
  );
}

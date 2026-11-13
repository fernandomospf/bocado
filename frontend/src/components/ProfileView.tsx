'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtDec, fmtInt } from '@/lib/format';
import { useMe, useProfile } from '@/lib/hooks';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS } from '@/lib/labels';
import type { Profile } from '@/lib/types';
import { Avatar } from './Avatar';
import { BodyForm } from './BodyForm';
import { ChevronRight } from './Icons';
import { Sheet } from './Sheet';
import { fromDraft, TargetsEditor, type TargetsDraft, toDraft } from './TargetsEditor';
import { WeightSection } from './WeightSection';

export function ProfileView() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: me } = useMe();
  const { data: profile, error, mutate } = useProfile();

  const [draft, setDraft] = useState<TargetsDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) setDraft(toDraft(profile.targets));
  }, [profile]);

  const dirty =
    profile && draft ? JSON.stringify(fromDraft(draft)) !== JSON.stringify(profile.targets) : false;

  async function apply(action: () => Promise<Profile>, ok: string) {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await action();
      await mutate(updated, { revalidate: false });
      void globalMutate((key) => typeof key === 'string' && key.startsWith('/days'));
      setMessage({ kind: 'ok', text: ok });
    } catch (err) {
      setMessage({ kind: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
    await globalMutate(() => true, undefined, { revalidate: false });
    router.replace('/login');
  }

  const goal = GOAL_OPTIONS.find((o) => o.value === profile?.goal)?.label;
  const activity = ACTIVITY_OPTIONS.find((o) => o.value === profile?.activityLevel)?.label;

  return (
    <main className="screen profile-screen">
      <header className="header">
        <h1 className="large-title">Perfil</h1>
      </header>

      {/*
        Desktop: duas colunas (perfil e metas | dados e demais seções). O DOM segue as colunas;
        no celular e no tablet os wrappers usam display: contents e as classes profile-o* (order)
        devolvem a ordem de sempre: usuário, peso, metas, dados, receitas, sair.
      */}
      <div className="profile-col">
        {me && (
          <section className="card glass row profile-o1" style={{ gap: 14 }}>
            <Avatar name={me.name} url={me.avatarUrl} large />
            <div style={{ minWidth: 0 }}>
              <p className="title">{me.name}</p>
              <p className="body-2" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {me.email}
              </p>
            </div>
          </section>
        )}

        {profile && draft && (
          <div className="screen-group profile-o3">
            <h2 className="section-title">Metas diárias</h2>
            <section className="card glass stack-lg">
              <TargetsEditor value={draft} onChange={setDraft} />
              <p className="caption">
                Sugestão para você: {fmtInt(profile.suggestion.kcal)} kcal · gasto estimado de{' '}
                {fmtInt(profile.suggestion.tdee)} kcal por dia.
              </p>
              {message && (
                <p className={message.kind === 'error' ? 'alert' : 'note'} role="status">
                  {message.text}
                </p>
              )}
              <div className="grid-2">
                <button
                  className="btn btn-glass"
                  disabled={busy || (!profile.customTargets && !dirty)}
                  onClick={() =>
                    apply(() => api<Profile>('/profile/targets/reset', { method: 'POST' }), 'Metas recalculadas.')
                  }
                >
                  Usar sugestão
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !dirty}
                  onClick={() =>
                    apply(
                      () => api<Profile>('/profile/targets', { method: 'PUT', json: fromDraft(draft) }),
                      'Metas salvas.',
                    )
                  }
                >
                  Salvar metas
                </button>
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="profile-col">
        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Seus dados</h2>
            <section className="card glass">
              <div className="list">
                {[
                  ['Objetivo', goal],
                  ['Peso', `${fmtDec(profile.weightKg)} kg`],
                  ['Altura', `${profile.heightCm} cm`],
                  ['Idade', `${profile.age} anos`],
                  ['Atividade', activity],
                ].map(([label, value]) => (
                  <div key={label} className="list-row">
                    <span className="list-row-main body-2">{label}</span>
                    <span className="list-row-end" style={{ color: 'var(--text)' }}>
                      {value}
                    </span>
                  </div>
                ))}
                <button className="list-row" onClick={() => setEditing(true)} style={{ color: 'var(--accent)' }}>
                  <span className="list-row-main headline">Editar dados</span>
                  <ChevronRight width={18} height={18} />
                </button>
              </div>
            </section>
          </div>
        )}

        {profile && (
          <div className="screen-group profile-o2">
            <WeightSection />
          </div>
        )}

        {error && (
          <p className="alert profile-o2" role="alert">
            {error.message}
          </p>
        )}

        <section className="card glass profile-o5" style={{ paddingTop: 6, paddingBottom: 6 }}>
          <div className="list">
            <Link href="/recipes" className="list-row" style={{ color: 'var(--accent)' }}>
              <span className="list-row-main headline">Minhas receitas</span>
              <ChevronRight width={18} height={18} />
            </Link>
          </div>
        </section>

        <nav
          className="caption profile-o5"
          style={{ display: 'flex', justifyContent: 'center', gap: 16 }}
          aria-label="Documentos legais"
        >
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Política de Privacidade</Link>
        </nav>

        <button className="btn btn-glass btn-block btn-danger profile-o5" onClick={logout}>
          Sair da conta
        </button>
      </div>

      {profile && (
        <Sheet open={editing} title="Editar dados" onClose={() => setEditing(false)}>
          <BodyForm
            key={profile.updatedAt}
            profile={profile}
            onSaved={async (updated) => {
              await mutate(updated, { revalidate: false });
              void globalMutate((key) => typeof key === 'string' && key.startsWith('/days'));
              setEditing(false);
            }}
          />
        </Sheet>
      )}
    </main>
  );
}

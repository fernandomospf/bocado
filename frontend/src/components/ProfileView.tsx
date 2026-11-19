'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtDec, fmtInt } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { useMe, useProfile } from '@/lib/hooks';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS } from '@/lib/labels';
import type { Profile, WeekStart } from '@/lib/types';
import { AdaptiveSection } from './AdaptiveSection';
import { AiUsageSection } from './AiUsageSection';
import { Avatar } from './Avatar';
import { BodyForm } from './BodyForm';
import { DeleteAccountSheet } from './DeleteAccountSheet';
import { ExportCard } from './ExportCard';
import { FavoritesSection } from './FavoritesSection';
import { HouseholdSection } from './HouseholdSection';
import { ChevronRight } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { fromDraft, TargetsEditor, type TargetsDraft, toDraft } from './TargetsEditor';
import { WeightSection } from './WeightSection';
import { WaterPrefs } from './WaterPrefs';
import { MovementPrefs } from './MovementPrefs';
import { SupplementsPrefs } from './SupplementsPrefs';
import { Glp1Prefs } from './Glp1Prefs';
import { ShortcutsSection } from './ShortcutsSection';
import { A11yPrefs } from './A11yPrefs';
import { FastingPrefs } from './FastingPrefs';
import { WorkoutPrefs } from './WorkoutPrefs';

const WEEK_START_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: 'MONDAY', label: 'Segunda' },
  { value: 'SUNDAY', label: 'Domingo' },
];

export function ProfileView() {
  const router = useRouter();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: me } = useMe();
  const { data: profile, error, mutate } = useProfile();

  const [draft, setDraft] = useState<TargetsDraft | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const toast = useToast();
  const { hideCalories: hide } = useDisplayPrefs();

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

  async function setWeekStart(weekStartsOn: WeekStart) {
    if (!profile || profile.weekStartsOn === weekStartsOn) return;
    tap();
    // Otimista: a faixa da semana na Hoje já usa o novo início; em erro, volta ao valor do servidor
    await mutate(
      async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: { weekStartsOn } }),
      { optimisticData: { ...profile, weekStartsOn }, rollbackOnError: true, revalidate: false },
    ).catch((err) => toast.show({ message: errorMessage(err), tone: 'error' }));
    // O resumo de movimento é por semana: muda junto com o início da semana
    void globalMutate((key) => typeof key === 'string' && key.startsWith('/workouts/week'));
  }

  async function setHideWeight(hideWeightInReports: boolean) {
    if (!profile || profile.hideWeightInReports === hideWeightInReports) return;
    tap();
    await mutate(
      async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: { hideWeightInReports } }),
      { optimisticData: { ...profile, hideWeightInReports }, rollbackOnError: true, revalidate: false },
    )
      .then(() => globalMutate((key) => typeof key === 'string' && key.startsWith('/reports')))
      .catch((err) => toast.show({ message: errorMessage(err), tone: 'error' }));
  }

  async function setHideCalories(hideCalories: boolean) {
    if (!profile || profile.hideCalories === hideCalories) return;
    tap();
    await mutate(
      async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: { hideCalories } }),
      { optimisticData: { ...profile, hideCalories }, rollbackOnError: true, revalidate: false },
    )
      .then(() =>
        // Tudo que mostra calorias muda de cara: dias, relatórios, meta adaptativa e treinos
        globalMutate(
          (key) =>
            typeof key === 'string' &&
            ['/days', '/reports', '/adaptive', '/workouts', '/suggestions'].some((p) => key.startsWith(p)),
        ),
      )
      .catch((err) => toast.show({ message: errorMessage(err), tone: 'error' }));
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
        devolvem a ordem de sempre: usuário, peso, metas, dados, sair.
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
              <TargetsEditor value={draft} onChange={setDraft} hideKcal={hide} />
              <p className="caption">
                {hide
                  ? `Sugestão para você: proteína ${fmtInt(profile.suggestion.protein)} g · carboidratos ${fmtInt(profile.suggestion.carbs)} g · gorduras ${fmtInt(profile.suggestion.fat)} g.`
                  : `Sugestão para você: ${fmtInt(profile.suggestion.kcal)} kcal · gasto estimado de ${fmtInt(profile.suggestion.tdee)} kcal por dia.`}
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
          <div className="screen-group profile-o4">
            <h2 className="section-title">Foco</h2>
            <section className="card glass stack">
              <label className="switch-row">
                <span>Esconder calorias</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={profile.hideCalories}
                  onChange={(e) => void setHideCalories(e.target.checked)}
                />
              </label>
              <p className="caption">
                Para quem prefere não ver números de calorias. Você continua acompanhando proteína e constância, e pode voltar atrás
                quando quiser. Seus dados continuam guardados.
              </p>
              <label className="switch-row">
                <span>Mostrar peso nos relatórios</span>
                <input
                  type="checkbox"
                  role="switch"
                  className="switch"
                  checked={!profile.hideWeightInReports}
                  onChange={(e) => void setHideWeight(!e.target.checked)}
                />
              </label>
            </section>
          </div>
        )}

        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Preferências</h2>
            <section className="card glass stack">
              <p className="body-2" id="week-start-label">
                A semana começa na
              </p>
              <div className="segmented" role="group" aria-labelledby="week-start-label">
                {WEEK_START_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    aria-pressed={profile.weekStartsOn === o.value}
                    onClick={() => void setWeekStart(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <MovementPrefs />
              <WorkoutPrefs />
              <WaterPrefs />
              <SupplementsPrefs />
              <Glp1Prefs />
              <FastingPrefs />
              <A11yPrefs />
            </section>
          </div>
        )}

        {profile && <ShortcutsSection />}

        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Meta adaptativa</h2>
            <AdaptiveSection />
          </div>
        )}

        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Uso da IA</h2>
            <AiUsageSection />
          </div>
        )}

        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Casa</h2>
            <HouseholdSection />
          </div>
        )}

        {profile && (
          <div className="screen-group profile-o4">
            <h2 className="section-title">Seus registros</h2>
            <FavoritesSection />
            <ExportCard />
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

        <nav
          className="caption profile-o5 legal-links"
          style={{ justifyContent: 'center' }}
          aria-label="Documentos legais"
        >
          <Link href="/termos">Termos de Uso</Link>
          <Link href="/privacidade">Política de Privacidade</Link>
        </nav>

        <button className="btn btn-glass btn-block btn-danger profile-o5" onClick={logout}>
          Sair da conta
        </button>

        {me && (
          <section className="danger-zone profile-o6" aria-labelledby="danger-zone-title">
            <h2 className="caption" id="danger-zone-title">
              Área de perigo
            </h2>
            <button type="button" className="btn btn-plain btn-danger" onClick={() => setDeleting(true)}>
              Excluir conta
            </button>
          </section>
        )}
      </div>

      {me && (
        <DeleteAccountSheet
          open={deleting}
          hasPassword={me.hasPassword}
          onClose={() => setDeleting(false)}
          onExportFirst={() => {
            setDeleting(false);
            // Depois de a folha fechar (ela devolve o foco a quem abriu), leva até o card de exportação
            setTimeout(() => {
              const card = document.getElementById('exportar');
              const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              card?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
              card?.focus({ preventScroll: true });
            }, 50);
          }}
        />
      )}

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

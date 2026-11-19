'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import {
  FAST_MAX_H,
  FAST_MIN_H,
  parseFast,
  parseMealMode,
  parseWater,
  parseWorkout,
  readDefaults,
  WATER_MAX_ML,
  WATER_MIN_ML,
  WORKOUT_INTENSITY_PARAM,
  WORKOUT_MAX_MIN,
  WORKOUT_MIN_MIN,
  WORKOUT_TYPE_PARAM,
  type WorkoutIntensityParam,
  type WorkoutTypeParam,
} from '@/lib/quickActions';
import type { Workout } from '@/lib/types';
import { INTENSITY_LABEL, WORKOUT_LABEL, workoutSummary } from '@/lib/workouts';
import { useWaterActions } from '@/lib/useWater';
import { useWorkoutActions } from '@/lib/useWorkouts';
import { useFastingCurrent } from './Fasting';
import { useQuickSheets } from './QuickSheets';
import { useToast } from './Toast';

/**
 * Cartão grande de confirmação dos atalhos. Abrir a URL NUNCA registra nada: só o botão principal (foco inicial; Enter
 * confirma) faz o POST. "Alterar" abre os campos, "Cancelar" volta para a Hoje.
 */
function ConfirmCard({
  title,
  description,
  confirmLabel = 'Registrar',
  busy,
  onConfirm,
  onCancel,
  editing,
  onEdit,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  editing: boolean;
  onEdit: () => void;
  children?: ReactNode;
}) {
  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    primary.current?.focus();
  }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!busy) onConfirm();
  }
  return (
    <main className="screen screen-narrow quick-screen">
      <form className="card glass stack-lg quick-card" onSubmit={submit} aria-labelledby="quick-title">
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="large-title" id="quick-title">
            {title}
          </h1>
          {description && <p className="body-2">{description}</p>}
        </div>
        {editing && <div className="stack">{children}</div>}
        <div className="stack">
          <button ref={primary} type="submit" className="btn btn-primary btn-block quick-primary" disabled={busy}>
            {busy ? <span className="spinner" aria-label="Registrando" /> : confirmLabel}
          </button>
          <div className="grid-2">
            {!editing && (
              <button type="button" className="btn btn-glass" onClick={onEdit} disabled={busy}>
                Alterar
              </button>
            )}
            <button type="button" className={editing ? 'btn btn-glass btn-block' : 'btn btn-plain'} style={editing ? { gridColumn: '1 / -1' } : undefined} onClick={onCancel} disabled={busy}>
              Cancelar
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

/** Módulo desligado: mensagem neutra com o link para ativar. */
function Off({ what, href, linkText }: { what: string; href: string; linkText: string }) {
  return (
    <main className="screen screen-narrow quick-screen">
      <section className="card glass stack quick-card" aria-labelledby="quick-off">
        <h1 className="large-title" id="quick-off">
          {what}
        </h1>
        <p className="body-2">Esse recurso está desligado no momento.</p>
        <Link href={href} className="btn btn-primary btn-block">
          {linkText}
        </Link>
        <Link href="/" className="btn btn-plain btn-block">
          Voltar para a Hoje
        </Link>
      </section>
    </main>
  );
}

const Loading = () => (
  <div className="splash" aria-busy="true">
    <span className="spinner" aria-label="Carregando" />
  </div>
);

// --- água ------------------------------------------------------------------------------------------------------------

export function QuickWater() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: profile } = useProfile();
  const { add } = useWaterActions(todayISO());
  const [init] = useState(() => parseWater(params, readDefaults(typeof window === 'undefined' ? undefined : window.localStorage).waterMl));
  const [ml, setMl] = useState(String(init.ml));
  const [editing, setEditing] = useState(!init.valid);
  const [busy, setBusy] = useState(false);
  const n = Number(ml);
  const valid = Number.isInteger(n) && n >= WATER_MIN_ML && n <= WATER_MAX_ML;

  if (!profile) return <Loading />;
  if (profile.waterEnabled === false) return <Off what="Contador de água" href="/profile#agua" linkText="Ativar nas preferências" />;

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    const res = await add(n, { undo: true });
    if (res) router.replace('/');
    else setBusy(false);
  }

  return (
    <ConfirmCard
      title={`Registrar ${valid ? n : '…'} ml de água?`}
      description={init.valid ? undefined : 'Esse valor não serve para o atalho. Escolha a quantidade abaixo.'}
      busy={busy || !valid}
      onConfirm={() => void confirm()}
      onCancel={() => router.replace('/')}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
      <label className="field">
        <span className="field-label">Quantidade (ml)</span>
        <div className="input-suffix">
          <input
            className="input num"
            inputMode="numeric"
            value={ml}
            aria-describedby="quick-water-help"
            aria-invalid={!valid}
            onChange={(e) => setMl(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <span>ml</span>
        </div>
        <span className="caption" id="quick-water-help">
          De {WATER_MIN_ML} a {WATER_MAX_ML} ml.
        </span>
      </label>
    </ConfirmCard>
  );
}

// --- treino ----------------------------------------------------------------------------------------------------------

export function QuickWorkout() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: profile } = useProfile();
  const { announceCreated } = useWorkoutActions();
  const toast = useToast();
  const [init] = useState(() => parseWorkout(params, readDefaults(typeof window === 'undefined' ? undefined : window.localStorage)));
  const [type, setType] = useState<WorkoutTypeParam>(init.type);
  const [min, setMin] = useState(String(init.min));
  const [intensity, setIntensity] = useState<WorkoutIntensityParam>(init.intensity);
  const [editing, setEditing] = useState(!init.valid);
  const [busy, setBusy] = useState(false);
  const minutes = Number(min);
  const valid = Number.isInteger(minutes) && minutes >= WORKOUT_MIN_MIN && minutes <= WORKOUT_MAX_MIN;

  if (!profile) return <Loading />;

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    try {
      const created = await api<Workout>('/workouts', {
        method: 'POST',
        json: { date: todayISO(), type: WORKOUT_TYPE_PARAM[type], durationMin: minutes, intensity: WORKOUT_INTENSITY_PARAM[intensity], note: '' },
      });
      router.replace('/');
      await announceCreated(created, `Treino registrado · ${workoutSummary(created)}`);
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  return (
    <ConfirmCard
      title={`Registrar ${WORKOUT_LABEL[WORKOUT_TYPE_PARAM[type]].toLowerCase()} de ${valid ? minutes : '…'} min?`}
      description={`Intensidade ${INTENSITY_LABEL[WORKOUT_INTENSITY_PARAM[intensity]].toLowerCase()}, hoje.${init.valid ? '' : ' Algum valor do atalho não serve: ajuste abaixo.'}`}
      busy={busy || !valid}
      onConfirm={() => void confirm()}
      onCancel={() => router.replace('/')}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
      <label className="field">
        <span className="field-label">Tipo</span>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as WorkoutTypeParam)}>
          {(Object.keys(WORKOUT_TYPE_PARAM) as WorkoutTypeParam[]).map((t) => (
            <option key={t} value={t}>
              {WORKOUT_LABEL[WORKOUT_TYPE_PARAM[t]]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">Duração (min)</span>
        <div className="input-suffix">
          <input className="input num" inputMode="numeric" value={min} aria-describedby="quick-min-help" aria-invalid={!valid} onChange={(e) => setMin(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          <span>min</span>
        </div>
        <span className="caption" id="quick-min-help">
          De {WORKOUT_MIN_MIN} a {WORKOUT_MAX_MIN} minutos.
        </span>
      </label>
      <label className="field">
        <span className="field-label">Intensidade</span>
        <select className="input" value={intensity} onChange={(e) => setIntensity(e.target.value as WorkoutIntensityParam)}>
          {(Object.keys(WORKOUT_INTENSITY_PARAM) as WorkoutIntensityParam[]).map((i) => (
            <option key={i} value={i}>
              {INTENSITY_LABEL[WORKOUT_INTENSITY_PARAM[i]]}
            </option>
          ))}
        </select>
      </label>
    </ConfirmCard>
  );
}

// --- peso ------------------------------------------------------------------------------------------------------------

/** Abre a Sheet de peso (abrir uma Sheet não registra nada: quem salva é a pessoa, dentro dela). */
export function QuickWeight() {
  const router = useRouter();
  const { openWeight } = useQuickSheets();
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    openWeight();
  }, [openWeight]);
  return (
    <main className="screen screen-narrow quick-screen">
      <section className="card glass stack-lg quick-card" aria-labelledby="quick-title">
        <h1 className="large-title" id="quick-title">
          Registrar peso
        </h1>
        <p className="body-2">A folha de peso abre sozinha. Se você a fechou, toque abaixo.</p>
        <button type="button" className="btn btn-primary btn-block" onClick={() => openWeight()}>
          Abrir o registro de peso
        </button>
        <button type="button" className="btn btn-plain btn-block" onClick={() => router.replace('/')}>
          Voltar para a Hoje
        </button>
      </section>
    </main>
  );
}

// --- refeição --------------------------------------------------------------------------------------------------------

/** Abre a Nova refeição no modo pedido (voz com o microfone já ligado, se o navegador permitir). Nada é registrado. */
export function QuickMeal() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const mode = parseMealMode(params);
    router.replace(mode === 'voz' ? '/add?voice=1' : mode === 'foto' ? '/add?mode=photo' : '/add');
  }, [params, router]);
  return <Loading />;
}

// --- jejum -----------------------------------------------------------------------------------------------------------

export function QuickFast() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: profile } = useProfile();
  const { data: current } = useFastingCurrent();
  const { openFasting } = useQuickSheets();
  const { mutate } = useSWRConfig();
  const toast = useToast();
  const [init] = useState(() => parseFast(params, readDefaults(typeof window === 'undefined' ? undefined : window.localStorage).fastHours));
  const [hours, setHours] = useState(String(init.hours));
  const [editing, setEditing] = useState(!init.valid);
  const [busy, setBusy] = useState(false);
  const h = Number(hours);
  const valid = Number.isInteger(h) && h >= FAST_MIN_H && h <= FAST_MAX_H;
  const opened = useRef(false);

  // Já há uma janela ativa: só mostra (a folha deixa encerrar ou ajustar)
  useEffect(() => {
    if (current && !opened.current) {
      opened.current = true;
      openFasting();
    }
  }, [current, openFasting]);

  if (!profile) return <Loading />;
  if (!profile.fastingEnabled) return <Off what="Jejum" href="/profile#jejum" linkText="Ativar nas preferências" />;
  if (current === undefined) return <Loading />;
  if (current) {
    return (
      <main className="screen screen-narrow quick-screen">
        <section className="card glass stack-lg quick-card" aria-labelledby="quick-title">
          <h1 className="large-title" id="quick-title">
            Janela de jejum
          </h1>
          <p className="body-2">Você já tem uma janela em andamento.</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => openFasting()}>
            Ver a janela
          </button>
          <button type="button" className="btn btn-plain btn-block" onClick={() => router.replace('/')}>
            Voltar para a Hoje
          </button>
        </section>
      </main>
    );
  }

  async function confirm() {
    if (!valid) return;
    setBusy(true);
    tap();
    try {
      const created = await api<{ id: string }>('/fasting/start', { method: 'POST', json: { targetHours: h } });
      await mutate('/fasting/current');
      router.replace('/');
      toast.show({
        message: `Janela de ${h} h iniciada`,
        durationMs: 5000,
        action: {
          label: 'Desfazer',
          onClick: () => {
            void api(`/fasting/${created.id}`, { method: 'DELETE' }).then(() => mutate('/fasting/current'));
          },
        },
      });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  return (
    <ConfirmCard
      title={`Iniciar uma janela de ${valid ? h : '…'} h?`}
      description={init.valid ? 'Você escolhe a duração; o Bocado só acompanha o tempo.' : 'Esse valor não serve para o atalho. Escolha de 12 a 20 horas.'}
      confirmLabel="Iniciar"
      busy={busy || !valid}
      onConfirm={() => void confirm()}
      onCancel={() => router.replace('/')}
      editing={editing}
      onEdit={() => setEditing(true)}
    >
      <label className="field">
        <span className="field-label">Horas</span>
        <div className="input-suffix">
          <input className="input num" inputMode="numeric" value={hours} aria-invalid={!valid} onChange={(e) => setHours(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          <span>h</span>
        </div>
      </label>
    </ConfirmCard>
  );
}

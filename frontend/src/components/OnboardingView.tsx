'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, ApiError, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/date';
import { fmtInt, parseNum } from '@/lib/format';
import { useMe } from '@/lib/hooks';
import { ACTIVITY_OPTIONS, GOAL_OPTIONS } from '@/lib/labels';
import type { ActivityLevel, BodyData, GoalType, Sex, Suggestion } from '@/lib/types';
import { CheckIcon, ChevronLeft } from './Icons';
import { Logo } from './Logo';
import { fromDraft, TargetsEditor, type TargetsDraft, toDraft } from './TargetsEditor';

const STEPS = 5;

function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return todayISO().replace(/^\d{4}/, String(d.getFullYear()));
}

export function OnboardingView() {
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: me, error: meError } = useMe();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<GoalType | null>(null);
  const [sex, setSex] = useState<Sex | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [targets, setTargets] = useState<TargetsDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (meError instanceof ApiError && meError.status === 401) router.replace('/login');
    else if (me?.onboarded) router.replace('/');
  }, [me, meError, router]);

  const heightCm = Math.round(parseNum(height));
  const weightKg = Math.round(parseNum(weight) * 10) / 10;

  const body = (): BodyData => ({
    goal: goal!,
    sex: sex!,
    birthDate,
    heightCm,
    weightKg,
    activityLevel: activity!,
  });

  const canContinue = [
    goal !== null,
    sex !== null && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && birthDate <= maxBirthDate(),
    heightCm >= 100 && heightCm <= 250 && weightKg >= 30 && weightKg <= 350,
    activity !== null,
    targets !== null && fromDraft(targets).kcal >= 800,
  ][step];

  async function next() {
    setError(null);
    if (step === 3) {
      setBusy(true);
      try {
        const s = await api<Suggestion>('/profile/preview', { method: 'POST', json: body() });
        setSuggestion(s);
        setTargets(toDraft(s));
        setStep(4);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 4) {
      setBusy(true);
      try {
        await api('/profile', { method: 'PUT', json: { ...body(), targets: fromDraft(targets!) } });
        await mutate('/auth/me');
        router.replace('/');
      } catch (err) {
        setError(errorMessage(err));
        setBusy(false);
      }
      return;
    }
    setStep((s) => s + 1);
  }

  if (!me || me.onboarded) {
    return (
      <div className="splash">
        <span className="spinner" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <main className="screen screen-plain onboarding-screen">
      <div className="brand desktop-only">
        <Logo size={56} />
        <span className="title">Bocado</span>
      </div>
      {/* Desktop: painel de vidro centralizado; no celular, display: contents */}
      <div className="onboarding-panel">
        <header className="header" style={{ alignItems: 'center' }}>
          <button
            className="btn btn-glass btn-icon"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0 || busy}
            aria-label="Etapa anterior"
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
          >
            <ChevronLeft width={20} height={20} />
          </button>
          <div className="progress-dots" aria-label={`Etapa ${step + 1} de ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <i key={i} data-active={i === step} data-done={i < step} />
            ))}
          </div>
          <span style={{ width: 44 }} aria-hidden />
        </header>

        <div key={step} className="stack-lg fade-in">
          {step === 0 && (
            <Step title={`Oi, ${me.name.split(' ')[0]}. Qual é o seu objetivo?`} lead="Usamos isso para calcular sua meta de calorias.">
              {GOAL_OPTIONS.map((o) => (
                <Choice key={o.value} selected={goal === o.value} onSelect={() => setGoal(o.value)} label={o.label} hint={o.hint} />
              ))}
            </Step>
          )}

          {step === 1 && (
            <Step title="Sobre você" lead="Sexo biológico e idade mudam o quanto o corpo gasta em repouso.">
              <div className="segmented" role="group" aria-label="Sexo biológico">
                <button type="button" aria-pressed={sex === 'FEMALE'} onClick={() => setSex('FEMALE')}>
                  Feminino
                </button>
                <button type="button" aria-pressed={sex === 'MALE'} onClick={() => setSex('MALE')}>
                  Masculino
                </button>
              </div>
              <label className="field">
                <span className="field-label">Data de nascimento</span>
                <input
                  className="input"
                  type="date"
                  value={birthDate}
                  max={maxBirthDate()}
                  min="1915-01-01"
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </label>
            </Step>
          )}

          {step === 2 && (
            <Step title="Suas medidas" lead="Você pode atualizar o peso quando quiser, no Perfil.">
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">Altura</span>
                  <div className="input-suffix">
                    <input className="input num" inputMode="numeric" placeholder="170" value={height} onChange={(e) => setHeight(e.target.value)} />
                    <span>cm</span>
                  </div>
                </label>
                <label className="field">
                  <span className="field-label">Peso</span>
                  <div className="input-suffix">
                    <input className="input num" inputMode="decimal" placeholder="70,5" value={weight} onChange={(e) => setWeight(e.target.value)} />
                    <span>kg</span>
                  </div>
                </label>
              </div>
            </Step>
          )}

          {step === 3 && (
            <Step title="Quanto você se movimenta?" lead="Considere uma semana típica, incluindo treinos e trabalho.">
              {ACTIVITY_OPTIONS.map((o) => (
                <Choice key={o.value} selected={activity === o.value} onSelect={() => setActivity(o.value)} label={o.label} hint={o.hint} />
              ))}
            </Step>
          )}

          {step === 4 && suggestion && targets && (
            <Step
              title="Sua meta diária"
              lead={`Seu corpo gasta cerca de ${fmtInt(suggestion.tdee)} kcal por dia. Esta é a nossa sugestão; ajuste se quiser.`}
            >
              <div className="card glass">
                <TargetsEditor value={targets} onChange={setTargets} />
              </div>
              <p className="caption">
                Cálculo pela fórmula de Mifflin-St Jeor. É uma estimativa: acompanhe seu peso por algumas semanas e ajuste.
              </p>
            </Step>
          )}

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button className="btn btn-primary btn-block" onClick={next} disabled={!canContinue || busy}>
            {busy ? <span className="spinner" aria-label="Carregando" /> : step === 4 ? 'Começar' : 'Continuar'}
          </button>
        </div>
      </div>
    </main>
  );
}

function Step({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <section className="stack-lg">
      <div className="stack" style={{ gap: 8 }}>
        <h1 className="large-title">{title}</h1>
        <p className="body-2">{lead}</p>
      </div>
      <div className="stack">{children}</div>
    </section>
  );
}

function Choice({ selected, onSelect, label, hint }: { selected: boolean; onSelect: () => void; label: string; hint: string }) {
  return (
    <button type="button" className="choice glass" aria-pressed={selected} onClick={onSelect}>
      <span className="choice-mark">{selected && <CheckIcon width={14} height={14} />}</span>
      <span className="stack" style={{ gap: 2 }}>
        <span className="headline">{label}</span>
        <span className="body-2">{hint}</span>
      </span>
    </button>
  );
}

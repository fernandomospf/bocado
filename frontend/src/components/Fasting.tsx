'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import {
  DEFAULT_FAST_HOURS,
  endedLine,
  fastLine,
  fastProgress,
  FAST_PRESETS,
  type FastingSession,
  fmtDuration,
  elapsedMs,
  fromLocalInput,
  toLocalInput,
} from '@/lib/fasting';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import { HourglassIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const KEY = '/fasting/current';

/** A janela ativa (ou null). Só consulta com o jejum ligado nas preferências (dado privado, sem cache de longa duração). */
export function useFastingCurrent() {
  const { data: profile } = useProfile();
  return useSWR<FastingSession | null>(profile?.fastingEnabled ? KEY : null, { revalidateOnFocus: true });
}

/** Relógio que anda a cada 30 s (a linha da Home e a folha mostram o tempo decorrido). */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/** Linha compacta da Home abaixo do cluster: "Janela de jejum · 11h20 de 16h" com barra neutra; toque abre a folha. */
export function FastingLine() {
  const { data: fast } = useFastingCurrent();
  const [open, setOpen] = useState(false);
  const now = useNow(!!fast);
  if (!fast) return null;
  const progress = fastProgress(fast.startedAt, fast.targetHours, now);
  return (
    <>
      <button type="button" className="adaptive-hint fasting-line" onClick={() => setOpen(true)} aria-label={`${fastLine(fast.startedAt, fast.targetHours, now)}. Abrir`}>
        <HourglassIcon width={20} height={20} aria-hidden />
        <span className="list-row-main">
          <span className="list-row-title num">{fastLine(fast.startedAt, fast.targetHours, now)}</span>
          <span className="fast-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progresso da janela">
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </span>
      </button>
      {open && <FastingSheet onClose={() => setOpen(false)} />}
    </>
  );
}

/** Iniciar (presets 12, 14, 16 e 18 h) ou, com uma janela ativa, ver, ajustar o horário e encerrar. */
export function FastingSheet({ onClose }: { onClose: () => void }) {
  const { data: fast, isLoading } = useFastingCurrent();
  const now = useNow(true);
  return (
    <Sheet open title="Jejum" onClose={onClose}>
      {isLoading && fast === undefined ? (
        <div className="skeleton" style={{ height: 120 }} />
      ) : fast ? (
        <ActiveFast fast={fast} now={now} onClose={onClose} />
      ) : (
        <StartFast onClose={onClose} />
      )}
    </Sheet>
  );
}

function StartFast({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [hours, setHours] = useState<number>(DEFAULT_FAST_HOURS);
  const [earlier, setEarlier] = useState('');
  const [busy, setBusy] = useState(false);
  const nowLocal = toLocalInput(new Date().toISOString());
  const minLocal = toLocalInput(new Date(Date.now() - 24 * 3_600_000).toISOString());

  async function start() {
    setBusy(true);
    tap();
    try {
      const startedAt = earlier ? fromLocalInput(earlier) : null;
      const created = await api<FastingSession>('/fasting/start', { method: 'POST', json: { targetHours: hours, ...(startedAt ? { startedAt } : {}) } });
      await mutate(KEY, created, { revalidate: false });
      onClose();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  return (
    <div className="stack-lg">
      <div>
        <h2 className="title">Janela de jejum</h2>
        <p className="caption">Você escolhe a duração; o Bocado só acompanha o tempo.</p>
      </div>
      <div className="scale-chips" role="group" aria-label="Duração da janela">
        {FAST_PRESETS.map((h) => (
          <button key={h} type="button" className="chip scale-chip" aria-pressed={hours === h} onClick={() => setHours(h)}>
            {h} h
          </button>
        ))}
      </div>
      <details className="adaptive-how">
        <summary>Começou antes?</summary>
        <label className="field" style={{ marginTop: 8 }}>
          <span className="field-label">Horário de início (até 24 h atrás)</span>
          <input className="input" type="datetime-local" min={minLocal} max={nowLocal} value={earlier} onChange={(e) => setEarlier(e.target.value)} />
        </label>
      </details>
      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={start}>
        {busy ? <span className="spinner" aria-label="Iniciando" /> : 'Iniciar janela'}
      </button>
    </div>
  );
}

function ActiveFast({ fast, now, onClose }: { fast: FastingSession; now: number; onClose: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [start, setStart] = useState(() => toLocalInput(fast.startedAt));
  const [busy, setBusy] = useState(false);
  const progress = fastProgress(fast.startedAt, fast.targetHours, now);
  const startedIso = fromLocalInput(start);
  const startChanged = startedIso !== null && startedIso !== fast.startedAt;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  const end = () =>
    run(async () => {
      tap();
      const ended = await api<FastingSession>(`/fasting/${fast.id}/end`, { method: 'POST', json: {} });
      await mutate(KEY, null, { revalidate: false });
      void mutate((k) => typeof k === 'string' && k.startsWith('/fasting'));
      // Encerrar antes da meta é normal: só a duração, sem cobrança
      toast.show({ message: endedLine(ended.durationMinutes ?? 0) });
      onClose();
    });

  const saveStart = () =>
    run(async () => {
      const updated = await api<FastingSession>(`/fasting/${fast.id}`, { method: 'PATCH', json: { startedAt: startedIso } });
      await mutate(KEY, updated, { revalidate: false });
      setBusy(false);
    });

  const remove = () =>
    run(async () => {
      await api(`/fasting/${fast.id}`, { method: 'DELETE' });
      await mutate(KEY, null, { revalidate: false });
      onClose();
    });

  return (
    <div className="stack-lg">
      <div>
        <h2 className="title">Janela de jejum</h2>
        <p className="body-2 num">
          {fmtDuration(elapsedMs(fast.startedAt, now))} de {fast.targetHours}h
        </p>
      </div>
      <span className="fast-bar fast-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Progresso da janela">
        <span style={{ width: `${Math.round(progress * 100)}%` }} />
      </span>
      <p className="caption">
        Começou {new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(fast.startedAt))}
      </p>

      <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={end}>
        Encerrar agora
      </button>

      <details className="adaptive-how">
        <summary>Editar o horário</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <label className="field">
            <span className="field-label">Início</span>
            <input className="input" type="datetime-local" value={start} max={toLocalInput(new Date().toISOString())} onChange={(e) => setStart(e.target.value)} />
          </label>
          <button type="button" className="btn btn-glass btn-block" disabled={busy || !startChanged} onClick={saveStart}>
            Salvar horário
          </button>
          <button type="button" className="btn btn-plain btn-block" disabled={busy} onClick={remove}>
            Apagar este registro
          </button>
        </div>
      </details>
    </div>
  );
}

/**
 * Pergunta neutra depois de registrar uma refeição com uma janela ativa. Sem insistir: "Manter" fecha e pronto.
 */
export function EndFastPrompt({ onDone }: { onDone: () => void }) {
  const { data: fast } = useFastingCurrent();
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [busy, setBusy] = useState(false);
  if (!fast) return null;
  async function end() {
    if (!fast) return;
    setBusy(true);
    try {
      const ended = await api<FastingSession>(`/fasting/${fast.id}/end`, { method: 'POST', json: {} });
      await mutate(KEY, null, { revalidate: false });
      toast.show({ message: endedLine(ended.durationMinutes ?? 0) });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      onDone();
    }
  }
  return (
    <Sheet open title="Jejum" onClose={onDone}>
      <div className="stack-lg">
        <h2 className="title">Encerrar a janela de jejum agora?</h2>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={end}>
            Encerrar agora
          </button>
          <button type="button" className="btn btn-plain btn-block" disabled={busy} onClick={onDone}>
            Manter a janela
          </button>
        </div>
      </div>
    </Sheet>
  );
}

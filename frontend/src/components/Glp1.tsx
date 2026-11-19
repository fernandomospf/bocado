'use client';

import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { dayTitle, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { useProfile } from '@/lib/hooks';
import { DOSE_DAY_TEXT, LOW_INTAKE_NOTE, LOW_INTAKE_SEEN_KEY, lowIntakeDue, lowIntakeVisible, WELLBEING_SCALES } from '@/lib/glp1';
import type { WellbeingDay } from '@/lib/types';
import { ChevronRight, PulseIcon } from './Icons';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

type Scales = Record<'nausea' | 'appetite' | 'energy' | 'gi', number | null>;
const BLANK: Scales = { nausea: null, appetite: null, energy: null, gi: null };

/** Bem-estar do dia. Dado privado: no-store no servidor, sem cache de longa duração aqui. */
export function useWellbeing(date: string, enabled: boolean) {
  return useSWR<WellbeingDay>(enabled ? `/wellbeing/${date}` : null, { revalidateOnFocus: false });
}

/** Linha compacta da Home (só com o modo GLP-1): "Como você está hoje?" abre a folha. */
export function WellbeingLine({ date }: { date: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useWellbeing(date, true);
  const answered = data ? WELLBEING_SCALES.some((s) => data[s.key] !== null) || !!data.note : false;
  const isToday = date === todayISO();
  return (
    <>
      <button type="button" className="adaptive-hint wellbeing-line" onClick={() => setOpen(true)}>
        <PulseIcon width={20} height={20} aria-hidden />
        <span className="list-row-main">
          <span className="list-row-title">{isToday ? 'Como você está hoje?' : `Como você estava · ${dayTitle(date)}`}</span>
          <span className="list-row-sub">{answered ? 'Anotado. Toque para ver ou ajustar' : 'Náusea, apetite, energia e intestino'}</span>
        </span>
        <ChevronRight width={18} height={18} aria-hidden />
      </button>
      {open && <WellbeingSheet date={date} onClose={() => setOpen(false)} />}
    </>
  );
}

function WellbeingSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data, isLoading } = useWellbeing(date, true);
  const [scales, setScales] = useState<Scales>(BLANK);
  const [note, setNote] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Preenche uma vez com o que já foi anotado no dia
  useEffect(() => {
    if (!data || loaded) return;
    setScales({ nausea: data.nausea, appetite: data.appetite, energy: data.energy, gi: data.gi });
    setNote(data.note ?? '');
    setLoaded(true);
  }, [data, loaded]);

  async function save() {
    setBusy(true);
    try {
      const saved = await api<WellbeingDay>(`/wellbeing/${date}`, { method: 'PUT', json: { ...scales, note: note.trim() || null } });
      await mutate(`/wellbeing/${date}`, saved, { revalidate: false });
      void mutate((k) => typeof k === 'string' && k.startsWith('/reports/weekly'));
      onClose();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Como você está hoje?" onClose={onClose}>
      <div className="stack-lg">
        <div>
          <h2 className="title">{date === todayISO() ? 'Como você está hoje?' : dayTitle(date)}</h2>
          <p className="caption">Só você vê isso. Não vai para a IA, a casa nem os relatórios compartilhados.</p>
          {typeof data?.dayOfCycle === 'number' && <p className="caption num">{DOSE_DAY_TEXT(data.dayOfCycle)}</p>}
        </div>

        {WELLBEING_SCALES.map((scale) => (
          <div key={scale.key} className="stack-sm" role="group" aria-label={scale.title}>
            <span className="field-label">{scale.title}</span>
            <div className="scale-chips">
              {scale.labels.map((label, level) => (
                <button
                  key={label}
                  type="button"
                  className="chip scale-chip"
                  aria-pressed={scales[scale.key] === level}
                  disabled={isLoading && !loaded}
                  onClick={() => {
                    tap();
                    // Tocar de novo no nível marcado desmarca (a pessoa pode não querer responder)
                    setScales((s) => ({ ...s, [scale.key]: s[scale.key] === level ? null : level }));
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ))}

        <label className="field">
          <span className="field-label">Nota (opcional)</span>
          <textarea className="textarea" rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>

        <button type="button" className="btn btn-primary btn-block" onClick={save} disabled={busy || (isLoading && !loaded)}>
          {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar'}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Aviso de segurança (o único sobre comer pouco): média dos últimos 5 dias registrados abaixo do piso de calorias do app.
 * Neutro, sem cor de alerta, no máximo uma vez por semana. Vale para a Home e para o relatório.
 */
export function LowIntakeNote({ active }: { active: boolean }) {
  const today = todayISO();
  const [lastShown, setLastShown] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setLastShown(window.localStorage.getItem(LOW_INTAKE_SEEN_KEY));
    } catch {
      setLastShown(null);
    }
    setReady(true);
  }, []);

  const visible = active && ready && lowIntakeVisible(lastShown, today);
  useEffect(() => {
    if (!active || !ready || !lowIntakeDue(lastShown, today)) return;
    try {
      window.localStorage.setItem(LOW_INTAKE_SEEN_KEY, today);
    } catch {
      // Sem armazenamento: o aviso só aparece nesta sessão
    }
    setLastShown(today);
  }, [active, ready, lastShown, today]);

  if (!visible) return null;
  return (
    <p className="note" role="note">
      {LOW_INTAKE_NOTE}
    </p>
  );
}

/** Bloco do modo GLP-1 na Home de hoje: bem-estar e o aviso de segurança. */
export function Glp1Home({ date }: { date: string }) {
  const { data: profile } = useProfile();
  const today = todayISO();
  const { data: summary } = useSWR<{ lowIntake: boolean }>(profile?.glp1Mode && date === today ? `/glp1/summary?today=${today}` : null, {
    revalidateOnFocus: false,
  });
  if (!profile?.glp1Mode) return null;
  return (
    <>
      <WellbeingLine date={date} />
      {date === today && <LowIntakeNote active={!!summary?.lowIntake} />}
    </>
  );
}

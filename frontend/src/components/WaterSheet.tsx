'use client';

import Link from 'next/link';
import { type FormEvent, useMemo, useState } from 'react';
import { todayISO, addDays, dayTitle, shortDay } from '@/lib/date';
import { parseNum } from '@/lib/format';
import { useProfile, useWaterDay, useWaterRange, useWaterStreak } from '@/lib/hooks';
import { useWaterActions } from '@/lib/useWater';
import {
  DOT_LABEL,
  DEFAULT_QUICK_ML,
  dotState,
  fmtMl,
  isWellOver,
  QUICK_ML,
  readLastMl,
  STATUS_LABEL,
  waterStatus,
} from '@/lib/water';
import { TrashIcon } from './Icons';
import { Sheet } from './Sheet';
import { WaterDrop } from './WaterDrop';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Folha "Água": gota, botões rápidos, registros do dia, sequência e como a meta é calculada. */
export function WaterSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const today = todayISO();
  const isToday = date === today;
  const { data: day } = useWaterDay(date);
  const { data: profile } = useProfile();
  const { add, remove } = useWaterActions(date);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = addDays(date, -6);
  const { data: range } = useWaterRange(from, date);
  const { data: streak } = useWaterStreak(date);
  const week = useMemo(() => {
    const byDate = new Map((range?.days ?? []).map((d) => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(from, i);
      return { date: d, state: dotState(byDate.get(d)) };
    });
  }, [range, from]);

  const now = new Date();
  const status = day ? (isToday ? waterStatus({ totalMl: day.totalMl, goalMl: day.goalMl, hour: now.getHours(), minute: now.getMinutes() }) : 'plain') : 'plain';
  const lastMl = typeof window === 'undefined' ? DEFAULT_QUICK_ML : readLastMl(window.localStorage);
  const bottle = profile?.waterBottleMl ?? null;
  const quick = [...QUICK_ML, ...(bottle && !QUICK_ML.includes(bottle as 150) ? [bottle] : [])];

  async function register(ml: number, undo = false) {
    if (busy) return;
    setBusy(true);
    setError(null);
    await add(ml, { undo });
    setBusy(false);
  }

  async function submitOther(e: FormEvent) {
    e.preventDefault();
    const ml = Math.round(parseNum(other));
    if (!(ml >= 50 && ml <= 2000)) return setError('Informe entre 50 e 2.000 ml.');
    await register(ml);
    setOther('');
  }

  return (
    <Sheet open title="Água" onClose={onClose}>
      <div className="stack-lg water-sheet">
        <div className="spread" style={{ alignItems: 'center' }}>
          <div className="stack" style={{ gap: 2 }}>
            <h2 className="title">Água</h2>
            <p className="caption">{isToday ? 'Hoje' : dayTitle(date)}</p>
          </div>
          <button type="button" className="btn btn-glass water-quick" disabled={busy} onClick={() => void register(lastMl, true)}>
            + {fmtMl(lastMl)} ml
          </button>
        </div>

        <div className="water-hero">
          <WaterDrop totalMl={day?.totalMl ?? 0} goalMl={day?.goalMl ?? null} />
          <div className="stack" style={{ gap: 4, textAlign: 'center' }} aria-live="polite">
            {day ? (
              <>
                <p className="title num">{day.goalMl ? `${fmtMl(day.totalMl)} de ${fmtMl(day.goalMl)} ml` : `${fmtMl(day.totalMl)} ml`}</p>
                {status !== 'plain' && <p className={`water-status water-status-${status}`} data-emphasis={(profile?.glp1Mode && status === 'nudge') || undefined}>{STATUS_LABEL[status]}</p>}
                {isWellOver(day.totalMl, day.goalMl) && <p className="caption">Você já passou bem da meta de hoje. Não precisa forçar.</p>}
                {day.needsManualGoal && (
                  <p className="note">
                    Defina a sua meta de água em{' '}
                    <Link href="/profile#agua" className="text-link" onClick={onClose}>
                      Perfil &gt; Preferências
                    </Link>
                    .
                  </p>
                )}
              </>
            ) : (
              <div className="skeleton" style={{ height: 44, width: 160 }} />
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 10 }}>
          <div className="water-buttons" role="group" aria-label="Registrar água">
            {quick.map((ml) => (
              <button key={ml} type="button" className="btn btn-glass" disabled={busy} onClick={() => void register(ml)}>
                {fmtMl(ml)} ml{bottle === ml ? ' · garrafa' : ''}
              </button>
            ))}
          </div>
          <form className="water-other" onSubmit={(e) => void submitOther(e)}>
            <label className="sr-only" htmlFor="water-other">
              Outro valor em ml
            </label>
            <div className="input-suffix" style={{ flex: 1 }}>
              <input
                id="water-other"
                className="input num"
                inputMode="numeric"
                placeholder="Outro valor"
                value={other}
                onChange={(e) => setOther(e.target.value.replace(/\D/g, ''))}
              />
              <span>ml</span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy || !other}>
              Adicionar
            </button>
          </form>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
        </div>

        {day && day.entries.length > 0 && (
          <div className="stack" style={{ gap: 4 }}>
            <h3 className="headline">{isToday ? 'Registros de hoje' : 'Registros do dia'}</h3>
            <div className="list">
              {[...day.entries].reverse().map((e) => (
                <div key={e.id} className="list-row">
                  <span className="list-row-main num">{fmtMl(e.amountMl)} ml</span>
                  <span className="caption num">{timeOf(e.createdAt)}</span>
                  <button type="button" className="btn btn-plain btn-icon" aria-label={`Excluir ${fmtMl(e.amountMl)} ml das ${timeOf(e.createdAt)}`} onClick={() => void remove(e.id)}>
                    <TrashIcon width={18} height={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="stack" style={{ gap: 8 }}>
          <div className="water-week" role="group" aria-label="Últimos 7 dias">
            {week.map((d) => (
              <span key={d.date} className="water-dot-wrap">
                <i className={`water-dot water-dot-${d.state}`} role="img" aria-label={`${dayTitle(d.date)}: ${DOT_LABEL[d.state]}`} />
                <span className="caption" aria-hidden>
                  {shortDay(d.date).slice(0, 3)}
                </span>
              </span>
            ))}
          </div>
          {streak && streak.current >= 2 && <p className="body-2 num" style={{ textAlign: 'center' }}>{streak.current} dias seguidos</p>}
        </div>

        <details className="adaptive-how">
          <summary>Como calculamos</summary>
          <div className="stack" style={{ gap: 8, marginTop: 8 }}>
            <p className="caption">
              35 ml por kg do seu peso (tendência dos últimos 7 dias), mais 10 ml por minuto de treino. É uma referência geral: sua
              necessidade pode variar. Se você tem orientação médica para limitar líquidos, desligue o contador ou defina a sua própria
              meta.
            </p>
            {day?.goalSource === 'auto' && day.explain.baseMl !== null && (
              <p className="caption num">
                Hoje: {fmtMl(day.explain.baseMl)} ml pelo peso ({day.explain.weightKg?.toLocaleString('pt-BR')} kg)
                {day.explain.workoutMl ? ` + ${fmtMl(day.explain.workoutMl)} ml do treino` : ''}. A meta fica entre 1.500 e 4.000 ml.
              </p>
            )}
            {day?.goalSource === 'manual' && <p className="caption">Você está usando a sua própria meta.</p>}
            <Link href="/profile#agua" className="text-link" onClick={onClose}>
              Ajustar nas preferências
            </Link>
          </div>
        </details>
      </div>
    </Sheet>
  );
}

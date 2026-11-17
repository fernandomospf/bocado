'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { readFrom } from '@/lib/gauge';
import { movementView } from '@/lib/gaugeModel';
import { success } from '@/lib/haptics';
import { FLAME_TRAVEL_MS, flameState, moveFromKey, moveGoalToastKey } from '@/lib/movement';
import type { MovementWeek } from '@/lib/types';
import { HalfGauge } from './HalfGauge';
import { FlameIcon } from './Icons';
import { useToast } from './Toast';

const BURST_MS = 600;

/**
 * Medidor de movimento da semana (direita do cluster). Ao subir, o arco preenche em ~1,4 s com uma chama pequena
 * viajando na ponta; ao fechar a meta da semana: brilho curto, chama acesa, toast e vibração uma vez por semana.
 * Com movimento reduzido, nada viaja nem tremula: o arco só muda de valor e a chama acesa fica estática.
 */
export function MovementGauge({ week, onOpen }: { week: MovementWeek; onOpen: () => void }) {
  const gid = useId().replace(/:/g, '');
  const toast = useToast();
  const view = movementView({ doneMin: week.doneMin, goalMin: week.goalMin });
  const { state, heat } = flameState(week.doneMin, week.goalMin);
  const memoryKey = moveFromKey(week.weekStart);

  // A meta já estava batida no último desenho? Lido ANTES de o medidor gravar o valor novo (null = sem histórico)
  const [initialReached] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const prev = readFrom(window.sessionStorage, memoryKey).move;
    return prev === undefined ? null : prev >= 1;
  });
  const prevReached = useRef(initialReached);
  const [burst, setBurst] = useState(false);
  const reachedRef = useRef(week.reached);
  reachedRef.current = week.reached;

  const celebrate = useCallback(() => {
    if (!reachedRef.current) return;
    const crossed = prevReached.current === false;
    prevReached.current = true;
    if (crossed) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), BURST_MS + 50);
    }
    // Toast e vibração: uma vez por semana, neste aparelho
    try {
      const key = moveGoalToastKey(week.weekStart);
      if (crossed && !window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, '1');
        toast.show({ message: 'Meta de movimento da semana batida', durationMs: 3500 });
        success();
      }
    } catch {
      /* sem armazenamento: sem toast */
    }
  }, [toast, week.weekStart]);

  // Meta reduzida/aumentada ou treino apagado: deixou de estar batida, volta ao normal
  useEffect(() => {
    if (!week.reached) prevReached.current = false;
  }, [week.reached, week.goalMin]);

  return (
    <button type="button" className={`gauge-btn move-${state}`} aria-label={view.ariaLabel} title={view.sentence} onClick={onOpen}>
      <HalfGauge
        arcs={view.arcs}
        size={100}
        strokeWidth={8}
        memoryKey={memoryKey}
        travelMs={FLAME_TRAVEL_MS}
        onTravelEnd={celebrate}
        renderTip={() => (
          <>
            <circle r={7} className="move-tip-glow" />
            <path
              className="move-tip-flame"
              transform="translate(-5 -10) scale(0.42)"
              d="M12 2.8c.6 3 3.2 4.6 4.6 7.2a6.2 6.2 0 11-11.2.4c.9-1.2 1.7-2.2 2.2-3.8 1 .8 1.6 1.8 1.8 2.8 1.2-2.2 2.2-4.1 2.6-6.6z"
            />
          </>
        )}
      >
        <FlameIcon state={state} heat={heat} gradientId={`${gid}-flame`} className="gauge-slot-icon" />
      </HalfGauge>
      {burst && <span className="move-burst" aria-hidden />}
      <span className="gauge-text">
        <span className="gauge-value num">{view.value}</span>
        <span className="gauge-label">{view.label}</span>
      </span>
    </button>
  );
}

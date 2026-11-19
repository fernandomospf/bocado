'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { readFrom } from '@/lib/gauge';
import { movementView } from '@/lib/gaugeModel';
import { success } from '@/lib/haptics';
import { FLAME_TRAVEL_MS, flameState, moveFromKey, moveReachedKey } from '@/lib/movement';
import type { DayMovement } from '@/lib/types';
import { GaugeText } from './GaugeText';
import { HalfGauge } from './HalfGauge';
import { FlameIcon } from './Icons';
import { useToast } from './Toast';

const BURST_MS = 600;

interface MovementGaugeProps {
  date: string;
  movement: DayMovement;
  hideCalories: boolean;
  isToday: boolean;
  onOpen: () => void;
}

/**
 * Medidor de movimento do DIA mostrado (direita do cluster): minutos / meta diária. Ao subir, o arco preenche em
 * ~1,4 s com uma chama pequena viajando na ponta; ao bater a meta do dia: brilho curto, chama acesa, aviso e vibração
 * uma vez por dia. Com movimento reduzido, nada viaja nem tremula: o arco só muda de valor e a chama acesa fica parada.
 */
export function MovementGauge({ date, movement, hideCalories, isToday, onOpen }: MovementGaugeProps) {
  const gid = useId().replace(/:/g, '');
  const toast = useToast();
  const view = movementView({ ...movement, hideCalories, isToday });
  // Acesa só com a meta do DIA batida (o mesmo que `movement.reached`)
  const { state, heat } = flameState(movement.minutes, movement.goalMin, movement.restDay);
  const lit = state === 'lit';
  const memoryKey = moveFromKey(date);

  // A meta já estava batida no último desenho? Lido ANTES de o medidor gravar o valor novo (null = sem histórico)
  const [initialReached] = useState<boolean | null>(() => {
    if (typeof window === 'undefined') return null;
    const prev = readFrom(window.sessionStorage, memoryKey).move;
    return prev === undefined ? null : prev >= 1;
  });
  const prevReached = useRef(initialReached);
  const [burst, setBurst] = useState(false);
  const reachedRef = useRef(lit);
  reachedRef.current = lit;

  const celebrate = useCallback(() => {
    if (!reachedRef.current) return;
    const crossed = prevReached.current === false;
    prevReached.current = true;
    if (crossed) {
      setBurst(true);
      window.setTimeout(() => setBurst(false), BURST_MS + 50);
    }
    // Aviso e vibração: uma vez por dia, neste aparelho, e só no dia de hoje
    if (!crossed || !isToday) return;
    try {
      const key = moveReachedKey(date);
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem(key, '1');
        toast.show({ message: 'Meta de movimento de hoje batida', durationMs: 3500 });
        success();
      }
    } catch {
      /* sem armazenamento: sem aviso */
    }
  }, [toast, date, isToday]);

  // Meta subiu ou treino apagado: deixou de estar batida, a chama volta ao normal
  useEffect(() => {
    if (!lit) prevReached.current = false;
  }, [lit, movement.goalMin]);

  return (
    <button type="button" className={`gauge-btn move-${state}`} aria-label={view.ariaLabel} title={view.sentence} onClick={onOpen}>
      <HalfGauge
        arcs={view.arcs}
        size={100}
        strokeWidth={8}
        memoryKey={memoryKey}
        decorative
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
      <GaugeText view={view} />
    </button>
  );
}

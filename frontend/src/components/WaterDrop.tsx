'use client';

import { useId } from 'react';
import { fmtMl } from '@/lib/water';

const DROP = 'M50 6C50 6 14 48 14 82a36 36 0 0 0 72 0C86 48 50 6 50 6Z';

/**
 * Gota que enche com o progresso. A água sobe com uma transição curta (desligada com prefers-reduced-motion, no CSS).
 * Acima de 100% a gota fica cheia: o excedente nunca é "premiado" nem punido.
 */
export function WaterDrop({ totalMl, goalMl, size = 150 }: { totalMl: number; goalMl: number | null; size?: number }) {
  const id = useId().replace(/:/g, '');
  const ratio = goalMl && goalMl > 0 ? Math.min(1, totalMl / goalMl) : 0;
  const fillY = 126 - ratio * 120; // topo da água (de 126 vazio a 6 cheio)
  const valueText = goalMl ? `${fmtMl(totalMl)} de ${fmtMl(goalMl)} ml` : `${fmtMl(totalMl)} ml`;
  return (
    <svg
      className="water-drop"
      width={size}
      height={size * 1.3}
      viewBox="0 0 100 130"
      role="progressbar"
      aria-label="Água de hoje"
      aria-valuemin={0}
      aria-valuemax={goalMl ?? undefined}
      aria-valuenow={goalMl ? Math.min(totalMl, goalMl) : totalMl}
      aria-valuetext={valueText}
    >
      <defs>
        <clipPath id={`${id}-clip`}>
          <path d={DROP} />
        </clipPath>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--water-2)" />
          <stop offset="100%" stopColor="var(--water)" />
        </linearGradient>
      </defs>
      <path d={DROP} className="water-drop-bg" />
      <g clipPath={`url(#${id}-clip)`}>
        <rect className="water-drop-fill" x="0" width="100" height="130" style={{ transform: `translateY(${fillY}px)` }} fill={`url(#${id}-fill)`} />
      </g>
      <path d={DROP} className="water-drop-edge" />
    </svg>
  );
}

'use client';

import { useEffect, useId, useState } from 'react';

export interface RingSpec {
  key: string;
  label: string;
  value: number;
  target: number;
  from: string;
  to: string;
}

interface RingsProps {
  rings: RingSpec[];
  size?: number;
  stroke?: number;
  gap?: number;
}

/**
 * Anéis concêntricos no estilo "Atividade" da Apple.
 * Acima de 100% o anel dá uma segunda volta, com sombra na ponta para mostrar o excesso.
 */
export function Rings({ rings, size = 176, stroke = 17, gap = 4 }: RingsProps) {
  const id = useId().replace(/:/g, '');
  const [ready, setReady] = useState(false);
  const center = size / 2;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const description = rings
    .map((r) => `${r.label}: ${Math.round(r.target ? (r.value / r.target) * 100 : 0)}% da meta`)
    .join('; ');

  return (
    <div className="rings" role="img" aria-label={description}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          {rings.map((r) => (
            <linearGradient key={r.key} id={`${id}-${r.key}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={r.to} />
              <stop offset="100%" stopColor={r.from} />
            </linearGradient>
          ))}
          <filter id={`${id}-tip`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="0" stdDeviation="2.2" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        {rings.map((r, i) => {
          const radius = center - stroke / 2 - i * (stroke + gap);
          const circ = 2 * Math.PI * radius;
          const pct = r.target > 0 ? Math.max(0, r.value / r.target) : 0;
          const first = Math.min(pct, 1);
          const overflow = Math.min(Math.max(pct - 1, 0), 1);
          const offset = (p: number) => (ready ? circ * (1 - p) : circ);
          const common = {
            cx: center,
            cy: center,
            r: radius,
            fill: 'none',
            strokeWidth: stroke,
            strokeLinecap: 'round' as const,
            transform: `rotate(-90 ${center} ${center})`,
          };

          return (
            <g key={r.key}>
              <circle {...common} stroke={r.from} strokeOpacity={0.18} />
              {first > 0.004 && (
                <circle
                  {...common}
                  className="ring-progress"
                  stroke={`url(#${id}-${r.key})`}
                  strokeDasharray={circ}
                  strokeDashoffset={offset(first)}
                  style={{ transitionDelay: `${i * 90}ms` }}
                />
              )}
              {overflow > 0.004 && (
                <circle
                  {...common}
                  className="ring-progress"
                  stroke={r.from}
                  strokeDasharray={circ}
                  strokeDashoffset={offset(overflow)}
                  filter={`url(#${id}-tip)`}
                  style={{ transitionDelay: `${900 + i * 90}ms` }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

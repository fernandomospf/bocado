'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { dash, fillFraction, gaugeGeometry, halfArcPath, pointOnArc, readFrom, slotBox, writeFrom } from '@/lib/gauge';
import type { GaugeArc } from '@/lib/gaugeModel';

interface HalfGaugeProps {
  arcs: GaugeArc[];
  /** Largura do sistema de coordenadas (viewBox). O tamanho na tela vem do CSS (100% da largura do pai). */
  size?: number;
  strokeWidth?: number;
  gap?: number;
  /** Chave do sessionStorage ("bocado:ringsFrom:<data>"): o arco anima do valor anterior, não de zero. */
  memoryKey?: string;
  /** Conteúdo central (ícone, número, rótulo), no vão inferior da meia-lua. */
  children?: ReactNode;
  className?: string;
}

/**
 * Medidor em meia-lua (180°, da esquerda ao topo e à direita), com arcos concêntricos quando há vários.
 * Genérico e sem biblioteca. Acima de 100% o arco fecha e um marcador discreto aparece no fim (sem "segunda volta").
 * A animação é só de stroke-dashoffset e respeita prefers-reduced-motion (no CSS).
 */
export function HalfGauge({ arcs, size = 200, strokeWidth = 14, gap = 4, memoryKey, children, className }: HalfGaugeProps) {
  const id = useId().replace(/:/g, '');
  const { cx, cy, height, radii } = gaugeGeometry(size, strokeWidth, gap, arcs.length);
  const slot = slotBox(size, strokeWidth, gap, arcs.length);
  const fractions = arcs.map((a) => fillFraction(a.value, a.target));
  const signature = `${arcs.map((a) => a.key).join('|')}:${fractions.join(',')}`;

  // `shown` é o que o SVG desenha agora; o CSS anima a diferença. Na montagem parte do valor guardado (ou de 0).
  const [shown, setShown] = useState<number[]>(() => arcs.map(() => 0));
  const [animate, setAnimate] = useState(false);
  const mounted = useRef(false);
  const latest = useRef({ arcs, fractions });
  latest.current = { arcs, fractions };

  useEffect(() => {
    const { arcs: current, fractions: next } = latest.current;
    let raf1 = 0;
    let raf2 = 0;
    if (!mounted.current) {
      mounted.current = true;
      const prev = memoryKey ? readFrom(window.sessionStorage, memoryKey) : {};
      setShown(current.map((a) => prev[a.key] ?? 0));
      // Dois quadros: o primeiro pinta o valor anterior sem transição, o segundo anima até o atual
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => {
          setAnimate(true);
          setShown(next);
        });
      });
    } else {
      setAnimate(true);
      setShown(next);
    }
    if (memoryKey) writeFrom(window.sessionStorage, memoryKey, Object.fromEntries(current.map((a, i) => [a.key, next[i]])));
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [signature, memoryKey]);

  return (
    <div className={`half-gauge${className ? ` ${className}` : ''}`} role="img" aria-label={arcs.map(describe).join('; ')}>
      <svg viewBox={`0 0 ${size} ${height}`} className="half-gauge-svg" focusable="false">
        <defs>
          {arcs.map((a) => (
            <linearGradient key={a.key} id={`${id}-${a.key}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" style={{ stopColor: a.from }} />
              <stop offset="100%" style={{ stopColor: a.to }} />
            </linearGradient>
          ))}
        </defs>
        {arcs.map((a, i) => {
          const r = radii[i];
          const d = halfArcPath(cx, cy, r);
          const { dasharray, dashoffset } = dash(r, shown[i] ?? 0);
          const fraction = fractions[i];
          const end = pointOnArc(cx, cy, r, 1);
          return (
            <g key={a.key}>
              <path d={d} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" style={{ stroke: a.from }} strokeOpacity={0.18} />
              {fraction > 0.004 && (
                <path
                  d={d}
                  fill="none"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  stroke={`url(#${id}-${a.key})`}
                  strokeDasharray={dasharray}
                  strokeDashoffset={dashoffset}
                  className={animate ? 'half-arc half-arc-anim' : 'half-arc'}
                  style={{ transitionDelay: animate ? `${i * 80}ms` : undefined }}
                />
              )}
              {a.overLabel && (
                <circle cx={end.x} cy={end.y} r={strokeWidth * 0.2} className="half-over-dot">
                  <title>{a.overLabel}</title>
                </circle>
              )}
            </g>
          );
        })}
      </svg>
      {children && (
        <div className="half-gauge-slot" style={{ left: `${slot.leftPct}%`, width: `${slot.widthPct}%`, height: `${slot.heightPct}%` }}>
          {children}
        </div>
      )}
    </div>
  );
}

const describe = (a: GaugeArc) =>
  a.target > 0
    ? `${a.label}: ${Math.round((a.value / a.target) * 100)}% da meta${a.overLabel ? `, ${a.overLabel}` : ''}`
    : a.label;

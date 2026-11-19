'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { dash, fillFraction, gaugeGeometry, halfArcPath, pointOnArc, readFrom, slotBox, writeFrom } from '@/lib/gauge';
import type { GaugeArc } from '@/lib/gaugeModel';
import { easeOutCubic } from '@/lib/movement';

interface HalfGaugeProps {
  arcs: GaugeArc[];
  /** Largura do sistema de coordenadas (viewBox). O tamanho na tela vem do CSS (100% da largura do pai). */
  size?: number;
  strokeWidth?: number;
  gap?: number;
  /** Chave do sessionStorage: o arco anima do valor anterior, não de zero ("bocado:ringsFrom:<data>"). */
  memoryKey?: string;
  /** Só um ícone pequeno, centralizado no vão inferior (nenhum texto dentro da meia-lua). */
  children?: ReactNode;
  className?: string;
  /** Dentro de um botão que já tem nome acessível completo: o desenho fica escondido do leitor de tela (sem nome duplicado). */
  decorative?: boolean;
  /**
   * Quando o PRIMEIRO arco aumenta, ele preenche em `travelMs` (ease-out) com `renderTip` desenhado na ponta.
   * Sem movimento reduzido; com ele, o arco só muda de valor.
   */
  travelMs?: number;
  renderTip?: (p: { x: number; y: number }) => ReactNode;
  onTravelEnd?: () => void;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Medidor em meia-lua (180°, da esquerda ao topo e à direita), com arcos concêntricos quando há vários.
 * Genérico e sem biblioteca. Acima de 100% o arco fecha e um marcador discreto aparece no fim (sem "segunda volta").
 * Anima só stroke-dashoffset (transição CSS) e, na viagem da ponta, transform; respeita prefers-reduced-motion.
 */
export function HalfGauge({
  arcs,
  size = 200,
  strokeWidth = 14,
  gap = 4,
  memoryKey,
  children,
  className,
  decorative,
  travelMs,
  renderTip,
  onTravelEnd,
}: HalfGaugeProps) {
  const id = useId().replace(/:/g, '');
  const { cx, cy, height, radii } = gaugeGeometry(size, strokeWidth, gap, arcs.length);
  const slot = slotBox(size, strokeWidth, gap, arcs.length);
  const fractions = arcs.map((a) => fillFraction(a.value, a.target));
  const signature = `${arcs.map((a) => a.key).join('|')}:${fractions.join(',')}`;

  // `shown` é o que o SVG desenha agora; a transição CSS (ou a viagem) anima a diferença
  const [shown, setShown] = useState<number[]>(() => arcs.map(() => 0));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const [animate, setAnimate] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const mounted = useRef(false);
  const latest = useRef({ arcs, fractions, travelMs, onTravelEnd, radii });
  latest.current = { arcs, fractions, travelMs, onTravelEnd, radii };

  useEffect(() => {
    const { arcs: current, fractions: next } = latest.current;
    let raf1 = 0;
    let raf2 = 0;
    let loop = 0;

    /** Viagem do primeiro arco de `from` até `next[0]`, quadro a quadro (sem transição CSS). */
    const travel = (from: number[]) => {
      const { travelMs: ms = 0, radii: rs } = latest.current;
      const start = performance.now();
      setAnimate(false);
      const frame = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        const f = from[0] + (next[0] - from[0]) * easeOutCubic(t);
        setShown([f, ...next.slice(1)]);
        setTip(pointOnArc(cx, cy, rs[0], f));
        if (t < 1) loop = requestAnimationFrame(frame);
        else {
          setTip(null);
          latest.current.onTravelEnd?.();
        }
      };
      loop = requestAnimationFrame(frame);
    };

    const go = (from: number[]) => {
      const canTravel = !!latest.current.travelMs && next.length > 0 && next[0] > (from[0] ?? 0) + 0.001 && !reducedMotion();
      if (canTravel) travel(from);
      else {
        setAnimate(true);
        setShown(next);
        if (next[0] !== undefined && next[0] > (from[0] ?? 0)) latest.current.onTravelEnd?.();
      }
    };

    if (!mounted.current) {
      mounted.current = true;
      const prev = memoryKey ? readFrom(window.sessionStorage, memoryKey) : {};
      const from = current.map((a) => prev[a.key] ?? 0);
      setShown(from);
      // Dois quadros: o primeiro pinta o valor anterior sem transição, o segundo anima até o atual
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => go(from));
      });
    } else {
      go(shownRef.current);
    }
    if (memoryKey) writeFrom(window.sessionStorage, memoryKey, Object.fromEntries(current.map((a, i) => [a.key, next[i]])));
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      cancelAnimationFrame(loop);
      setTip(null);
    };
  }, [signature, memoryKey, cx, cy]);

  return (
    <div
      className={`half-gauge${className ? ` ${className}` : ''}`}
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': arcs.map(describe).join('; ') })}
    >
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
          const end = pointOnArc(cx, cy, r, 1);
          return (
            <g key={a.key}>
              <path d={d} fill="none" strokeWidth={strokeWidth} strokeLinecap="round" style={{ stroke: a.from }} strokeOpacity={0.18} />
              {(fractions[i] > 0.004 || (shown[i] ?? 0) > 0.004) && (
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
                  {!decorative && <title>{a.overLabel}</title>}
                </circle>
              )}
            </g>
          );
        })}
        {tip && renderTip && (
          <g className="half-tip" style={{ transform: `translate(${tip.x}px, ${tip.y}px)` }}>
            {renderTip(tip)}
          </g>
        )}
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

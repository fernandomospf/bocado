import { dayMonth } from '@/lib/date';
import { fmtDec } from '@/lib/format';
import type { WeightEntry } from '@/lib/types';

const W = 320;
const H = 150;
const PAD = { top: 10, right: 8, bottom: 22, left: 34 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
/** Mesma janela da média móvel: acima disso, a tendência não tem continuidade. */
const TREND_GAP_DAYS = 7;

/** Dia como inteiro, sem efeito de horário de verão. */
function dayIndex(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Curva suave que passa pelos pontos sem "passar do ponto" entre eles (spline cúbica monotônica, Fritsch–Carlson).
 * Evita que a linha da tendência invente picos ou vales que não existem nos dados.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  const n = points.length;
  if (n === 0) return '';
  if (n === 1) return `M${points[0].x},${points[0].y}`;

  const dx = points.slice(1).map((p, i) => p.x - points[i].x);
  const slope = points.slice(1).map((p, i) => (p.y - points[i].y) / (dx[i] || 1));
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    return slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  });
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = Math.hypot(a, b);
    if (h > 3) {
      tangent[i] = (3 / h) * a * slope[i];
      tangent[i + 1] = (3 / h) * b * slope[i];
    }
  }

  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const p = points[i];
    const q = points[i + 1];
    const h = dx[i] / 3;
    d += ` C${p.x + h},${p.y + tangent[i] * h} ${q.x - h},${q.y - tangent[i + 1] * h} ${q.x},${q.y}`;
  }
  return d;
}

interface WeightChartProps {
  /** Registros do período, em ordem crescente de data. */
  entries: WeightEntry[];
  from: string;
  to: string;
  label: string;
}

/** Pontos = pesagens; linha = média de 7 dias. Escala Y com folga automática. */
export function WeightChart({ entries, from, to, label }: WeightChartProps) {
  const start = dayIndex(from);
  const span = Math.max(1, dayIndex(to) - start);

  const values = entries.flatMap((e) => [e.weightKg, e.trendKg]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max((max - min) * 0.15, 0.5);
  const yMin = min - pad;
  const yMax = max + pad;

  const x = (iso: string) => PAD.left + ((dayIndex(iso) - start) / span) * PLOT_W;
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin)) * PLOT_H;
  const r = (n: number) => Math.round(n * 10) / 10;

  const ticks = max - min < 0.05 ? [min] : [min, (min + max) / 2, max];

  // Mais de 7 dias sem registro: a média recomeça do zero, então a linha é interrompida em vez de ligar o vazio
  const segments: WeightEntry[][] = [];
  entries.forEach((e, i) => {
    const gap = i > 0 ? dayIndex(e.date) - dayIndex(entries[i - 1].date) : 0;
    if (i === 0 || gap > TREND_GAP_DAYS) segments.push([e]);
    else segments[segments.length - 1].push(e);
  });
  const trendPaths = segments
    .filter((s) => s.length > 1)
    .map((s) => smoothPath(s.map((e) => ({ x: r(x(e.date)), y: r(y(e.trendKg)) }))));

  return (
    <svg className="weight-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {ticks.map((t) => (
        <g key={t}>
          <line className="weight-chart-grid" x1={PAD.left} x2={W - PAD.right} y1={r(y(t))} y2={r(y(t))} />
          <text x={PAD.left - 6} y={r(y(t))} textAnchor="end" dominantBaseline="middle">
            {fmtDec(t)}
          </text>
        </g>
      ))}

      <text x={PAD.left} y={H - 6} textAnchor="start">
        {dayMonth(from)}
      </text>
      <text x={W - PAD.right} y={H - 6} textAnchor="end">
        {dayMonth(to)}
      </text>

      {trendPaths.map((d) => (
        <path key={d} className="weight-chart-trend" d={d} />
      ))}
      {entries.map((e) => (
        <circle key={e.date} className="weight-chart-point" cx={r(x(e.date))} cy={r(y(e.weightKg))} r={3} />
      ))}
    </svg>
  );
}

/** Anel pequeno de calorias (ou de proteína, no modo sem calorias): consumido/meta. Acima da meta fica cheio. Decorativo: o rótulo vai no botão. */
export function MiniRing({ value, target, size = 28, tone = 'kcal' }: { value: number; target: number; size?: number; tone?: 'kcal' | 'protein' }) {
  const stroke = size / 8;
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <svg className={tone === 'protein' ? 'mini-ring mini-ring-protein' : 'mini-ring'} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={r} fill="none" strokeWidth={stroke} className="mini-ring-track" />
      {pct > 0.01 && (
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          transform={`rotate(-90 ${c} ${c})`}
          className="mini-ring-fill"
        />
      )}
    </svg>
  );
}

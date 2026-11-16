'use client';

import { type AiFeature, PAUSED_MESSAGE } from '@/lib/aiQuota';
import { useAiQuota } from '@/lib/hooks';

const ROWS: { feature: AiFeature; label: string }[] = [
  { feature: 'PHOTO', label: 'Análises por foto' },
  { feature: 'TEXT', label: 'Análises por descrição' },
  { feature: 'LABEL', label: 'Leituras de rótulo' },
  { feature: 'SUGGEST', label: 'Sugestões com IA' },
];

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Uma barra neutra (azul do app, nunca vermelho): quanto da cota já foi usado. */
function Meter({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div
      className="quota-track"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={limit}
      aria-valuenow={Math.min(used, limit)}
      aria-valuetext={`${used} de ${limit}`}
    >
      <span className="quota-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Perfil > Uso da IA: o que já foi usado hoje e no mês, e quando volta. */
export function AiUsageSection() {
  const { data: q, error } = useAiQuota();
  if (error) return null;
  if (!q) return <div className="skeleton" style={{ height: 140 }} />;

  return (
    <section className="card glass stack" aria-label="Uso da IA">
      {q.paused && (
        <p className="note" role="status">
          {PAUSED_MESSAGE}
        </p>
      )}

      <div className="stack" style={{ gap: 14 }}>
        {ROWS.map(({ feature, label }) => {
          const f = q.features[feature];
          return (
            <div key={feature} className="quota-row">
              <div className="spread">
                <span className="body-2">{label}</span>
                <span className="num">{f.limit === 0 ? 'Indisponível' : `${f.used} de ${f.limit}`}</span>
              </div>
              <Meter label={`${label} hoje`} used={f.used} limit={f.limit} />
            </div>
          );
        })}
        <p className="caption">Os limites diários voltam às {hhmm(q.features.PHOTO.resetsAt)}.</p>
      </div>

      <div className="quota-row">
        <div className="spread">
          <span className="body-2">Total do mês</span>
          <span className="num">{q.monthly.limit === 0 ? 'Indisponível' : `${q.monthly.used} de ${q.monthly.limit}`}</span>
        </div>
        <Meter label="Total de usos de IA no mês" used={q.monthly.used} limit={q.monthly.limit} />
        <p className="caption">Recomeça em {ddmm(q.monthly.resetsAt)}.</p>
      </div>

      <p className="caption">Os limites existem para manter o beta gratuito e estável para todo mundo.</p>
    </section>
  );
}

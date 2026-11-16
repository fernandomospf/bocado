'use client';

import { useState } from 'react';
import { useSWRConfig } from 'swr';
import { api, ApiError, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { success as hapticSuccess } from '@/lib/haptics';
import { useAdaptiveStatus } from '@/lib/hooks';
import type { AdaptiveConfidence, AdaptiveStatus } from '@/lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const CONFIDENCE_LABEL: Record<AdaptiveConfidence, string> = {
  LOW: 'Confiança baixa',
  MEDIUM: 'Confiança média',
  HIGH: 'Confiança alta',
};

/** Evidência em linguagem simples, com os números que a sugestão usou. */
function evidenceText(s: AdaptiveStatus) {
  const e = s.estimate!;
  const change = Math.abs(e.weightEndKg - e.weightStartKg) < 0.05
    ? `ficou estável em ${fmtDec(e.weightEndKg)} kg`
    : `mudou de ${fmtDec(e.weightStartKg)} para ${fmtDec(e.weightEndKg)} kg`;
  return `Nas últimas 4 semanas você comeu em média ${fmtInt(e.avgIntake)} kcal por dia e sua tendência de peso ${change}. Isso indica um gasto perto de ${fmtInt(e.tdee)} kcal.`;
}

/** "Ajustar sua meta": mostra a evidência e deixa a pessoa aplicar, manter ou adiar. Nunca aplica sozinho. */
export function AdaptiveSheet({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: status, mutate } = useAdaptiveStatus();
  const [busy, setBusy] = useState<'apply' | 'dismiss' | 'snooze' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = todayISO();

  const refreshAll = () =>
    globalMutate((key) => typeof key === 'string' && (key.startsWith('/adaptive') || key === '/profile' || key.startsWith('/days') || key.startsWith('/reports')));

  async function apply() {
    const s = status?.suggestion;
    if (!s || busy) return;
    setBusy('apply');
    setError(null);
    setNotice(null);
    try {
      await api('/adaptive/apply', { method: 'POST', json: { today, expectedKcal: s.newKcal } });
      hapticSuccess();
      await refreshAll();
      toast.show({ message: `Meta atualizada para ${fmtInt(s.newKcal)} kcal`, durationMs: 3500 });
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // A sugestão mudou: mostra os números novos e pede nova confirmação
        const fresh = (err.data as { status?: AdaptiveStatus } | null)?.status;
        if (fresh) await mutate(fresh, { revalidate: false });
        setNotice(
          fresh?.state === 'suggestion'
            ? 'A sugestão mudou desde que você abriu esta tela. Confira os novos números e confirme de novo.'
            : 'Não há mais uma sugestão para aplicar agora.',
        );
      } else {
        setError(errorMessage(err));
      }
      setBusy(null);
    }
  }

  async function postpone(action: 'DISMISSED' | 'SNOOZED') {
    if (busy) return;
    setBusy(action === 'DISMISSED' ? 'dismiss' : 'snooze');
    setError(null);
    try {
      await api('/adaptive/dismiss', { method: 'POST', json: { today, action, snoozeDays: 14 } });
      await refreshAll();
      toast.show({ message: action === 'DISMISSED' ? 'Mantivemos a sua meta' : 'Lembramos de novo em 2 semanas', durationMs: 3000 });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  const s = status?.suggestion;

  return (
    <Sheet open title="Ajustar sua meta" onClose={onClose}>
      <div className="stack-lg">
        {!status ? (
          <div className="skeleton" style={{ height: 160 }} aria-busy="true" />
        ) : !s || !status.estimate ? (
          <p className="body-2">Não há uma sugestão de ajuste agora. A sua meta continua como está.</p>
        ) : (
          <>
            {notice && (
              <p className="note" role="status">
                {notice}
              </p>
            )}

            <p className="body-2">{evidenceText(status)}</p>
            {status.estimate.confidence === 'MEDIUM' && (
              <p className="caption">
                Como ainda há poucos dados, misturamos essa estimativa com o gasto calculado pela fórmula ({fmtInt(s.formulaTdee)}{' '}
                kcal) e usamos {fmtInt(status.estimate.usedTdee)} kcal.
              </p>
            )}

            <section className="card glass stack-sm" aria-label="Meta atual e sugerida">
              <div className="adaptive-compare">
                <div className="stat">
                  <span className="caption">Meta atual</span>
                  <strong>{fmtInt(s.currentKcal)}</strong>
                  <span className="caption">kcal por dia</span>
                </div>
                <span aria-hidden className="adaptive-arrow">
                  →
                </span>
                <div className="stat">
                  <span className="caption">Meta sugerida</span>
                  <strong>{fmtInt(s.newKcal)}</strong>
                  <span className="caption">kcal por dia</span>
                </div>
              </div>
              <p className="caption">
                Proteína {fmtInt(s.macros.protein)} g · Carboidratos {fmtInt(s.macros.carbs)} g · Gorduras {fmtInt(s.macros.fat)} g
              </p>
              <span className="badge" style={{ alignSelf: 'flex-start' }}>
                {CONFIDENCE_LABEL[status.estimate.confidence]}
              </span>
            </section>

            <p className="caption">
              É uma estimativa. Depende de você ter registrado a maior parte do que comeu e de oscilações de água no peso.
            </p>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <div className="stack">
              <button type="button" className="btn btn-primary btn-block" onClick={() => void apply()} disabled={!!busy}>
                {busy === 'apply' ? <span className="spinner" aria-label="Aplicando" /> : 'Aplicar nova meta'}
              </button>
              <button type="button" className="btn btn-glass btn-block" onClick={() => void postpone('DISMISSED')} disabled={!!busy}>
                Manter a minha
              </button>
              <button type="button" className="btn btn-plain btn-block" onClick={() => void postpone('SNOOZED')} disabled={!!busy}>
                Lembrar em 2 semanas
              </button>
            </div>

            <details className="adaptive-how">
              <summary>Como calculamos</summary>
              <ol className="caption">
                <li>Olhamos as últimas 4 semanas e usamos só os dias com registro razoável (dias quase vazios ficam de fora).</li>
                <li>Comparamos a média do seu peso no começo e no fim do período, para ver quanto ele mudou por dia.</li>
                <li>Cada kg a mais ou a menos equivale a cerca de 7.700 kcal: somamos isso à média do que você comeu para chegar ao gasto.</li>
                <li>A meta sugerida é o gasto vezes o fator do seu objetivo, em passos de no máximo 150 kcal e nunca abaixo do mínimo do app.</li>
              </ol>
            </details>
          </>
        )}
      </div>
    </Sheet>
  );
}

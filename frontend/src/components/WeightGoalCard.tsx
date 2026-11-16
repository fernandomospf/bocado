'use client';

import { useEffect, useState } from 'react';
/** Sempre com 1 casa decimal nesta barra: "Início 94,0 · Agora 91,8 · Meta 85,0". */
const kg1 = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
import { useProfile } from '@/lib/hooks';
import type { WeightSummary } from '@/lib/types';
import { KeepWeightSheet } from './KeepWeightSheet';
import { WeightGoalSheet } from './WeightGoalSheet';

/** "Agora não" no card de meta alcançada: some por 14 dias (por meta). */
const DISMISS_DAYS = 14;
const dismissKey = (targetKg: number) => `bocado:weightGoal:dismissed:${targetKg}`;

/**
 * Perfil > Peso > "Meta de peso". Só referência, em tom neutro: sem datas prometidas, sem contagem regressiva e sem
 * "atrasado". Não altera as metas de calorias. Menores de 18 anos não veem esta seção.
 */
export function WeightGoalCard({ summary }: { summary: WeightSummary }) {
  const { data: profile } = useProfile();
  const [sheet, setSheet] = useState<'goal' | 'keep' | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const goal = summary.goal;

  useEffect(() => {
    if (!goal) return;
    try {
      const at = Number(localStorage.getItem(dismissKey(goal.targetKg)));
      setDismissed(Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000);
    } catch {
      setDismissed(false);
    }
  }, [goal?.targetKg, goal?.reached]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!profile || profile.age < 18) return null;

  function dismiss() {
    if (!goal) return;
    try {
      localStorage.setItem(dismissKey(goal.targetKg), String(Date.now()));
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    setDismissed(true);
  }

  return (
    <>
      <section className="card glass stack" aria-labelledby="weight-goal-title">
        <div className="spread">
          <h3 className="headline" id="weight-goal-title">
            Meta de peso
          </h3>
          {goal && (
            <button type="button" className="btn btn-plain btn-sm" onClick={() => setSheet('goal')}>
              Editar
            </button>
          )}
        </div>

        {goal ? (
          <>
            <div
              className="goal-track"
              role="progressbar"
              aria-label="Progresso até a meta de peso"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(goal.progressPct)}
              aria-valuetext={`Início ${kg1(goal.startKg)} kg, agora ${kg1(goal.currentKg)} kg, meta ${kg1(goal.targetKg)} kg`}
            >
              <span className="goal-fill" style={{ width: `${goal.progressPct}%` }} />
            </div>
            <p className="body-2 num">
              Início {kg1(goal.startKg)} · Agora {kg1(goal.currentKg)} · Meta {kg1(goal.targetKg)}
            </p>
            {goal.remainingKg > 0 && <p className="caption num">Faltam {kg1(goal.remainingKg)} kg</p>}
          </>
        ) : (
          <>
            <p className="body-2">Uma referência para o gráfico, no seu ritmo. Sem prazo e sem cobrança.</p>
            <button type="button" className="btn btn-glass btn-block" onClick={() => setSheet('goal')}>
              Definir meta de peso
            </button>
          </>
        )}
      </section>

      {goal?.reached && !dismissed && (
        <section className="card glass stack" aria-label="Meta de peso alcançada">
          <h3 className="headline">Você chegou perto da sua meta</h3>
          <p className="body-2">Quer manter esse peso daqui para frente, ou escolher uma nova meta?</p>
          <div className="stack">
            <button type="button" className="btn btn-primary btn-block" onClick={() => setSheet('keep')}>
              Passar para manter o peso
            </button>
            <button type="button" className="btn btn-glass btn-block" onClick={() => setSheet('goal')}>
              Definir uma nova meta
            </button>
            <button type="button" className="btn btn-plain btn-block" onClick={dismiss}>
              Agora não
            </button>
          </div>
        </section>
      )}

      {sheet === 'goal' && <WeightGoalSheet summary={summary} onClose={() => setSheet(null)} />}
      {sheet === 'keep' && <KeepWeightSheet onClose={() => setSheet(null)} />}
    </>
  );
}

'use client';

import { type CSSProperties, useState } from 'react';
import { fmtInt } from '@/lib/format';
import { ringsFromKey } from '@/lib/gauge';
import { macroView, waterView } from '@/lib/gaugeModel';
import { useProfile, useWaterDay } from '@/lib/hooks';
import { STATUS_LABEL, waterStatus } from '@/lib/water';
import type { DayMovement, Macros, Meal } from '@/lib/types';
import { DayCompositionSheet } from './DayCompositionSheet';
import { GaugeText } from './GaugeText';
import { HalfGauge } from './HalfGauge';
import { DropIcon } from './Icons';
import { MovementGauge } from './MovementGauge';
import { useQuickSheets } from './QuickSheets';
import { ringSpecs } from './ringSpecs';

interface GaugeClusterProps {
  date: string;
  /** Sem metas ainda: o cluster inteiro vira esqueleto. */
  targets?: Macros;
  totals: Macros;
  meals: Meal[];
  hideCalories: boolean;
  /** Movimento do dia mostrado (GET /days/:date). */
  movement?: DayMovement;
  isToday: boolean;
}

/** Legenda curta (a Energia já está no centro; sem calorias, a Proteína também). */
const STRIP = [
  { key: 'kcal', label: 'Energia', color: 'var(--ring-kcal)' },
  { key: 'protein', label: 'Proteína', color: 'var(--ring-protein)' },
  { key: 'carbs', label: 'Carbo', color: 'var(--ring-carbs)' },
  { key: 'fat', label: 'Gordura', color: 'var(--ring-fat)' },
] as const;

/**
 * Os três medidores da Hoje: água (esquerda), macros (centro, ~1,7x) e movimento (direita), com a MESMA linha de
 * base. Nenhum texto dentro das meias-luas: cada um tem um bloco de uma linha de rótulo e uma de valor embaixo.
 * O tamanho vem do espaço do CARD (container query em globals.css, `.gauge-cluster`), não da tela. Medidores
 * desligados somem; macros fica sempre presente e no centro.
 */
export function GaugeCluster({ date, targets, totals, meals, hideCalories, movement, isToday }: GaugeClusterProps) {
  const { data: profile } = useProfile();
  const { openWater, openMovement } = useQuickSheets();
  const [compositionOpen, setCompositionOpen] = useState(false);

  // Enquanto o perfil não chega, os laterais aparecem como esqueleto (sem pulo de layout depois)
  const waterOn = profile ? profile.waterEnabled : true;
  const moveOn = profile ? profile.movementEnabled : true;
  const water = useWaterDay(date, !!profile?.waterEnabled);
  const sides = (waterOn ? 1 : 0) + (moveOn ? 1 : 0);
  const memoryKey = ringsFromKey(date);

  if (!targets) {
    return (
      <div className="gauge-cluster" data-sides={sides} aria-busy="true">
        <div className="gauge-grid">
          {waterOn && <div className="gauge-cell gauge-cell-water skeleton gauge-skeleton" />}
          <div className="gauge-cell gauge-cell-center skeleton gauge-skeleton" />
          {moveOn && <div className="gauge-cell gauge-cell-move skeleton gauge-skeleton" />}
        </div>
        <div className="macro-strip skeleton" style={{ height: 44 }} />
      </div>
    );
  }

  // Modo GLP-1: a proteína (contra o piso) vira o texto central; a energia continua no arco e passa para a linha de macros
  const glp1 = profile?.glp1Mode === true;
  const floor = glp1 ? (profile?.proteinFloorG ?? targets.protein) : null;
  const macro = macroView({ arcs: ringSpecs(totals, targets, hideCalories), totals, targets, hideCalories, proteinFloor: floor });
  const waterModel = profile?.waterEnabled && water.data ? waterView({ totalMl: water.data.totalMl, goalMl: water.data.goalMl }) : null;
  // A Energia só entra na linha com o modo GLP-1 (nele o centro é a proteína); sem calorias, a Proteína já está no centro
  // Modo GLP-1: "Hora de um copo d'água" ganha destaque (a regra de cálculo é a mesma da folha de água)
  const now = new Date();
  const waterNudge =
    glp1 && isToday && !!water.data && waterStatus({ totalMl: water.data.totalMl, goalMl: water.data.goalMl, hour: now.getHours(), minute: now.getMinutes() }) === 'nudge';
  const strip = STRIP.filter((s) => (s.key === 'kcal' ? glp1 && !hideCalories : !(s.key === 'protein' && hideCalories)));

  return (
    <div className="gauge-cluster" data-sides={sides}>
      <div className="gauge-grid">
        {waterOn && (
          <div className="gauge-cell gauge-cell-water gauge-cell-side">
            {waterModel ? (
              <button
                type="button"
                className="gauge-btn"
                aria-label={waterModel.ariaLabel}
                title={waterNudge ? `${waterModel.sentence}. ${STATUS_LABEL.nudge}` : waterModel.sentence}
                data-nudge={waterNudge || undefined}
                onClick={() => openWater(date)}
              >
                <HalfGauge arcs={waterModel.arcs} size={100} strokeWidth={8} memoryKey={memoryKey} decorative>
                  <DropIcon className="gauge-slot-icon" style={{ color: 'var(--water)' }} />
                </HalfGauge>
                <GaugeText view={waterModel} />
              </button>
            ) : (
              <SideFallback label="Água" failed={!!water.error} />
            )}
          </div>
        )}

        <div className="gauge-cell gauge-cell-center">
          <button type="button" className="gauge-btn" aria-label={macro.ariaLabel} title={macro.sentence} onClick={() => setCompositionOpen(true)}>
            <HalfGauge arcs={macro.arcs} size={150} strokeWidth={10} gap={3} memoryKey={memoryKey} decorative />
            <GaugeText view={macro} large />
          </button>
        </div>

        {moveOn && (
          <div className="gauge-cell gauge-cell-move gauge-cell-side">
            {profile?.movementEnabled && movement ? (
              <MovementGauge date={date} movement={movement} hideCalories={hideCalories} isToday={isToday} onOpen={() => openMovement(date)} />
            ) : (
              <SideFallback label="Movimento" failed={false} />
            )}
          </div>
        )}
      </div>

      {/* Só os macros têm legenda: uma linha, separada por um fio */}
      <div className="macro-strip" style={{ '--cols': strip.length } as CSSProperties}>
        {strip.map((s) => (
          <div key={s.key} className="macro-strip-item">
            <span className="macro-strip-head">
              <span className="macro-strip-dot" style={{ background: s.color }} aria-hidden />
              {s.key === 'protein' && glp1 ? 'Proteína · piso' : s.label}
            </span>
            <span className="macro-strip-val num">
              {fmtInt(totals[s.key])}{' '}
              <span className="macro-strip-total">
                / {fmtInt(s.key === 'protein' && floor ? floor : targets[s.key])}{s.key === 'kcal' ? '' : ' g'}
              </span>
            </span>
          </div>
        ))}
      </div>

      {compositionOpen && (
        <DayCompositionSheet
          date={date}
          totals={totals}
          targets={targets}
          meals={meals}
          hideCalories={hideCalories}
          onClose={() => setCompositionOpen(false)}
        />
      )}
    </div>
  );
}

/** Lateral sem dados: esqueleto enquanto carrega; "—" discreto se a consulta deu erro. */
function SideFallback({ label, failed }: { label: string; failed: boolean }) {
  if (!failed) return <div className="skeleton gauge-skeleton" />;
  return (
    <div className="gauge-btn gauge-empty">
      <GaugeText view={{ value: '—', label, fit: 'normal' }} />
    </div>
  );
}

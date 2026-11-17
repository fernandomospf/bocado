'use client';

import { type CSSProperties, useState } from 'react';
import { fmtInt } from '@/lib/format';
import { ringsFromKey } from '@/lib/gauge';
import { macroView, waterView } from '@/lib/gaugeModel';
import { useMovementWeek, useProfile, useWaterDay } from '@/lib/hooks';
import type { Macros, Meal } from '@/lib/types';
import { DayCompositionSheet } from './DayCompositionSheet';
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
}

/** Legenda curta (a Energia já está no centro; sem calorias, a Proteína também). */
const STRIP = [
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
export function GaugeCluster({ date, targets, totals, meals, hideCalories }: GaugeClusterProps) {
  const { data: profile } = useProfile();
  const { openWater, openMovement } = useQuickSheets();
  const [compositionOpen, setCompositionOpen] = useState(false);

  // Enquanto o perfil não chega, os laterais aparecem como esqueleto (sem pulo de layout depois)
  const waterOn = profile ? profile.waterEnabled : true;
  const moveOn = profile ? profile.movementEnabled : true;
  const water = useWaterDay(date, !!profile?.waterEnabled);
  const week = useMovementWeek(date, !!profile?.movementEnabled);
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

  const macro = macroView({ arcs: ringSpecs(totals, targets, hideCalories), totals, targets, hideCalories });
  const waterModel = profile?.waterEnabled && water.data ? waterView({ totalMl: water.data.totalMl, goalMl: water.data.goalMl }) : null;
  const strip = STRIP.filter((s) => !(hideCalories && s.key === 'protein'));

  return (
    <div className="gauge-cluster" data-sides={sides}>
      <div className="gauge-grid">
        {waterOn && (
          <div className="gauge-cell gauge-cell-water gauge-cell-side">
            {waterModel ? (
              <button type="button" className="gauge-btn" aria-label={waterModel.ariaLabel} title={waterModel.sentence} onClick={() => openWater(date)}>
                <HalfGauge arcs={waterModel.arcs} size={100} strokeWidth={8} memoryKey={memoryKey}>
                  <DropIcon className="gauge-slot-icon" style={{ color: 'var(--water)' }} />
                </HalfGauge>
                <span className="gauge-text">
                  <span className="gauge-value num">{waterModel.value}</span>
                  <span className="gauge-label">{waterModel.label}</span>
                </span>
              </button>
            ) : (
              <SideFallback label="Água" failed={!!water.error} />
            )}
          </div>
        )}

        <div className="gauge-cell gauge-cell-center">
          <button type="button" className="gauge-btn" aria-label={macro.ariaLabel} title={macro.sentence} onClick={() => setCompositionOpen(true)}>
            <HalfGauge arcs={macro.arcs} size={150} strokeWidth={10} gap={3} memoryKey={memoryKey} />
            <span className="gauge-text">
              <span className="gauge-label">{macro.label}</span>
              <span className="gauge-value gauge-value-lg num">{macro.value}</span>
            </span>
          </button>
        </div>

        {moveOn && (
          <div className="gauge-cell gauge-cell-move gauge-cell-side">
            {profile?.movementEnabled && week.data ? (
              <MovementGauge week={week.data} onOpen={() => openMovement(date)} />
            ) : (
              <SideFallback label="Movimento" failed={!!week.error} />
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
              {s.label}
            </span>
            <span className="macro-strip-val num">
              {fmtInt(totals[s.key])} <span className="macro-strip-total">/ {fmtInt(targets[s.key])} g</span>
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
      <span className="gauge-text">
        <span className="gauge-value">—</span>
        <span className="gauge-label">{label}</span>
      </span>
    </div>
  );
}

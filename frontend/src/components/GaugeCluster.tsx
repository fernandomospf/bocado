'use client';

import { useState } from 'react';
import { useProfile, useMovementWeek, useWaterDay } from '@/lib/hooks';
import { ringsFromKey } from '@/lib/gauge';
import { macroView, movementView, waterView } from '@/lib/gaugeModel';
import { STATUS_LABEL, waterStatus } from '@/lib/water';
import type { Macros, Meal } from '@/lib/types';
import { DayCompositionSheet } from './DayCompositionSheet';
import { HalfGauge } from './HalfGauge';
import { DropIcon, FlameIcon } from './Icons';
import { MacroLegend } from './MacroLegend';
import { useQuickSheets } from './QuickSheets';
import { ringSpecs } from './ringSpecs';

interface GaugeClusterProps {
  date: string;
  today: string;
  /** Sem metas ainda: o cluster inteiro vira esqueleto. */
  targets?: Macros;
  totals: Macros;
  meals: Meal[];
  hideCalories: boolean;
}

/**
 * Os três medidores da Hoje: água (esquerda), macros (centro, maior e com a legenda) e movimento (direita).
 * O tamanho vem do espaço do CARD (container query em globals.css, `.gauge-cluster`), não da tela. Medidores
 * desligados somem e o resto se recentraliza; macros está sempre presente.
 */
export function GaugeCluster({ date, today, targets, totals, meals, hideCalories }: GaugeClusterProps) {
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
      <div className="gauge-cluster" aria-busy="true">
        <div className="gauge-row" data-sides={sides} style={{ '--sides': sides } as React.CSSProperties}>
          {waterOn && <div className="gauge-cell gauge-cell-side skeleton gauge-skeleton" />}
          <div className="gauge-cell gauge-cell-center skeleton gauge-skeleton" />
          {moveOn && <div className="gauge-cell gauge-cell-side skeleton gauge-skeleton" />}
        </div>
      </div>
    );
  }

  const macro = macroView({ arcs: ringSpecs(totals, targets, hideCalories), totals, targets, hideCalories });

  const waterModel = profile?.waterEnabled && water.data
    ? waterView({
        totalMl: water.data.totalMl,
        goalMl: water.data.goalMl,
        statusLabel: (() => {
          if (date !== today) return undefined;
          const now = new Date();
          const s = waterStatus({ totalMl: water.data.totalMl, goalMl: water.data.goalMl, hour: now.getHours(), minute: now.getMinutes() });
          return s === 'plain' ? undefined : STATUS_LABEL[s];
        })(),
      })
    : null;

  const moveModel =
    profile?.movementEnabled && week.data
      ? movementView({
          doneMin: week.data.doneMin,
          goalMin: week.data.goalMin,
          estimateKcal: week.data.estimateKcal,
          hideCalories,
        })
      : null;

  return (
    <div className="gauge-cluster">
      <div className="gauge-row" data-sides={sides} style={{ '--sides': sides } as React.CSSProperties}>
        {waterOn &&
          (waterModel ? (
            <div className="gauge-cell gauge-cell-side">
              <button type="button" className="gauge-btn" aria-label={waterModel.ariaLabel} onClick={() => openWater(date)}>
                <HalfGauge arcs={waterModel.arcs} size={120} strokeWidth={10} memoryKey={memoryKey}>
                  <DropIcon className="gauge-slot-icon" style={{ color: 'var(--water)' }} />
                  <span className="gauge-slot-main num">{waterModel.slotMain}</span>
                </HalfGauge>
                <span className="gauge-label">{waterModel.label}</span>
                {waterModel.caption && <span className="gauge-caption">{waterModel.caption}</span>}
              </button>
            </div>
          ) : (
            <SideFallback label="Água" failed={!!water.error} />
          ))}

        <div className="gauge-cell gauge-cell-center">
          <button type="button" className="gauge-btn gauge-btn-center" aria-label={macro.ariaLabel} onClick={() => setCompositionOpen(true)}>
            <HalfGauge arcs={macro.arcs} size={200} strokeWidth={10} gap={3} memoryKey={memoryKey}>
              {macro.slotTop && <span className="gauge-slot-top">{macro.slotTop}</span>}
              <span className="gauge-slot-main gauge-slot-main-lg num">{macro.slotMain}</span>
            </HalfGauge>
          </button>
        </div>

        {moveOn &&
          (moveModel ? (
            <div className="gauge-cell gauge-cell-side">
              <button type="button" className="gauge-btn" aria-label={moveModel.ariaLabel} onClick={() => openMovement(date)}>
                <HalfGauge arcs={moveModel.arcs} size={120} strokeWidth={10}>
                  <FlameIcon className="gauge-slot-icon" style={{ color: 'var(--flame)' }} />
                  <span className="gauge-slot-main num">{moveModel.slotMain}</span>
                </HalfGauge>
                <span className="gauge-label">{moveModel.label}</span>
                {moveModel.caption && <span className="gauge-caption">{moveModel.caption}</span>}
              </button>
            </div>
          ) : (
            <SideFallback label="Movimento · semana" failed={!!week.error} />
          ))}
      </div>

      {/* Só o medidor central tem legenda */}
      <MacroLegend totals={totals} targets={targets} hideKcal={hideCalories} />

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

/** Lateral sem dados: esqueleto enquanto carrega; "Sem dados" discreto se a consulta falhou. */
function SideFallback({ label, failed }: { label: string; failed: boolean }) {
  return (
    <div className="gauge-cell gauge-cell-side">
      {failed ? (
        <div className="gauge-btn gauge-empty">
          <span className="gauge-label">{label}</span>
          <span className="gauge-caption">Sem dados agora</span>
        </div>
      ) : (
        <div className="skeleton gauge-skeleton" />
      )}
    </div>
  );
}

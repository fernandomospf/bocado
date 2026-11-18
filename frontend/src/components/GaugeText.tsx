import type { GaugeView } from '@/lib/gaugeModel';

/**
 * Bloco de texto de um medidor: DUAS linhas (valor e rótulo), mesma altura mínima nas três colunas, sem quebrar.
 * O total ("/ 2.400") vem em tom muted e um pouco menor. Texto longo reduz a fonte (container query, `data-fit`).
 */
export function GaugeText({ view, large = false }: { view: Pick<GaugeView, 'value' | 'total' | 'label' | 'fit'>; large?: boolean }) {
  return (
    <span className="gauge-text">
      <span className={`gauge-value num${large ? ' gauge-value-lg' : ''}`} data-fit={view.fit}>
        {view.value}
        {view.total && <span className="gauge-total">{view.total}</span>}
      </span>
      <span className="gauge-label" data-fit={view.label.length > 23 ? 'long' : 'normal'}>
        {view.label}
      </span>
    </span>
  );
}

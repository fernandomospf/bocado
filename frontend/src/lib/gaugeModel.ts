/**
 * Textos e arcos de cada medidor da Home (puro, testável). Tom sem culpa: passar da meta é um dado, nunca um alerta.
 * Com "esconder calorias" nenhuma kcal sai daqui (nem no texto nem no aria-label).
 */

export interface GaugeArc {
  key: string;
  label: string;
  value: number;
  target: number;
  from: string;
  to: string;
  /** "12 g além da meta": vira o marcador discreto no fim do arco. */
  overLabel?: string;
}

export interface GaugeView {
  arcs: GaugeArc[];
  /** Linha pequena e linha principal do vão central. */
  slotTop?: string;
  slotMain: string;
  /** Frase completa, usada na leitura por voz. */
  sentence: string;
  ariaLabel: string;
}

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const n0 = (n: number) => int.format(Math.round(n));

/** 1200 → "1,2 L"; 800 → "800 ml". */
export const fmtLiters = (ml: number) => (ml >= 1000 ? `${dec2.format(ml / 1000)} L` : `${n0(ml)} ml`);

const pct = (value: number, target: number) => Math.round(target > 0 ? (value / target) * 100 : 0);

// --- macros -----------------------------------------------------------------

export interface MacroInput {
  arcs: Omit<GaugeArc, 'overLabel'>[];
  totals: { kcal: number; protein: number };
  targets: { kcal: number; protein: number };
  hideCalories: boolean;
}

export function macroView({ arcs, totals, targets, hideCalories }: MacroInput): GaugeView {
  const withOver: GaugeArc[] = arcs
    // Modo sem calorias: a Energia nem entra (o backend guarda tudo, a tela só não mostra)
    .filter((a) => !(hideCalories && a.key === 'kcal'))
    .map((a) => {
      const over = a.target > 0 ? Math.max(0, a.value - a.target) : 0;
      return over > 0 ? { ...a, overLabel: `${n0(over)} ${a.key === 'kcal' ? 'kcal' : 'g'} além da meta` } : a;
    });
  const description = withOver
    .map((a) => `${a.label}: ${pct(a.value, a.target)}% da meta${a.overLabel ? `, ${a.overLabel}` : ''}`)
    .join('; ');

  if (hideCalories) {
    const left = Math.round(targets.protein - totals.protein);
    const hit = left <= 0;
    const sentence = hit ? 'Meta de proteína batida' : `Proteína: faltam ${n0(left)} g`;
    return {
      arcs: withOver,
      slotTop: 'Proteína',
      slotMain: hit ? 'batida' : `faltam ${n0(left)} g`,
      sentence,
      ariaLabel: `Macros. ${sentence}. ${description}`,
    };
  }
  const remaining = targets.kcal - totals.kcal;
  const sentence = remaining >= 0 ? `Restam ${n0(remaining)} kcal` : `${n0(-remaining)} kcal além da meta`;
  return {
    arcs: withOver,
    slotTop: remaining >= 0 ? 'Restam' : 'Além da meta',
    slotMain: `${n0(Math.abs(remaining))} kcal`,
    sentence,
    ariaLabel: `Macros. ${sentence}. ${description}`,
  };
}

// --- água -------------------------------------------------------------------

export interface WaterInput {
  totalMl: number;
  goalMl: number | null;
  /** Rótulo de ritmo ("No ritmo", "Meta batida"); vazio em dias passados. */
  statusLabel?: string;
}

export function waterView({ totalMl, goalMl, statusLabel }: WaterInput) {
  const hasGoal = goalMl !== null && goalMl > 0;
  const over = hasGoal ? Math.max(0, totalMl - goalMl) : 0;
  const arc: GaugeArc = {
    key: 'water',
    label: 'Água',
    value: totalMl,
    target: hasGoal ? goalMl : 0,
    from: 'var(--water)',
    to: 'var(--water-2)',
    ...(over > 0 ? { overLabel: `${fmtLiters(over)} além da meta` } : {}),
  };
  const caption = statusLabel || (hasGoal ? `de ${fmtLiters(goalMl)}` : '');
  const main = fmtLiters(totalMl);
  return {
    arcs: [arc],
    slotMain: main,
    label: 'Água',
    caption,
    ariaLabel: `Água: ${main}${hasGoal ? ` de ${fmtLiters(goalMl)}` : ''}${statusLabel ? `. ${statusLabel}` : ''}${arc.overLabel ? `. ${arc.overLabel}` : ''}`,
  };
}

// --- movimento --------------------------------------------------------------

export interface MovementInput {
  doneMin: number;
  goalMin: number | null;
  /** Só chega com a preferência ligada; com "esconder calorias" a Home nunca mostra. */
  estimateKcal: number | null;
  hideCalories: boolean;
}

export function movementView({ doneMin, goalMin, estimateKcal, hideCalories }: MovementInput) {
  const hasGoal = goalMin !== null && goalMin > 0;
  const over = hasGoal ? Math.max(0, doneMin - goalMin) : 0;
  const arc: GaugeArc = {
    key: 'move',
    label: 'Movimento',
    value: doneMin,
    target: hasGoal ? goalMin : 0,
    from: 'var(--flame)',
    to: 'var(--flame-2)',
    ...(over > 0 ? { overLabel: `${n0(over)} min além da meta` } : {}),
  };
  const main = hasGoal ? `${n0(doneMin)}/${n0(goalMin)} min` : `${n0(doneMin)} min`;
  const estimate = !hideCalories && estimateKcal !== null ? `≈ ${n0(estimateKcal)} kcal (estimativa)` : '';
  return {
    arcs: [arc], // sem meta: só a trilha, sem progresso (target 0)
    slotMain: main,
    label: 'Movimento · semana',
    caption: estimate,
    ariaLabel: `Movimento da semana: ${main}${arc.overLabel ? `. ${arc.overLabel}` : ''}${estimate ? `. ${estimate}` : ''}`,
  };
}

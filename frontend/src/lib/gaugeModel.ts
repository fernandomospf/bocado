/**
 * Textos e arcos de cada medidor da Home (puro, testável). Tom sem culpa: passar da meta é um dado, nunca um alerta.
 * Nenhum texto fica dentro das meias-luas: cada medidor tem um bloco de DUAS linhas abaixo do arco (valor e rótulo),
 * cada uma em uma linha só. Com "esconder calorias" nenhuma kcal sai daqui (nem no texto nem no aria-label).
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
  /** Linha 1: o valor ("271"), seguido de `total` em tom muted (" / 2.400"), se houver. */
  value: string;
  total?: string;
  /** Linha 2 (12px, secundária). */
  label: string;
  /** Texto longo: a fonte reduz por container query (nunca quebra linha). */
  fit: 'normal' | 'long';
  /** Frase completa: leitura por voz e tooltip. */
  sentence: string;
  ariaLabel: string;
}

const int = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const dec1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const dec2 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const n0 = (n: number) => int.format(Math.round(n));

/** 1200 → "1,2 L"; 800 → "800 ml". */
export const fmtLiters = (ml: number) => (ml >= 1000 ? `${dec2.format(ml / 1000)} L` : `${n0(ml)} ml`);

/** Água do cluster, consumido / meta na MESMA unidade: "1,2 / 2,6 L"; abaixo de 1 L, "800 / 2.600 ml". */
export function waterPair(totalMl: number, goalMl: number | null): { value: string; total?: string } {
  const liters = totalMl >= 1000;
  const fmt = (ml: number) => (liters ? dec1.format(ml / 1000) : n0(ml));
  const unit = liters ? 'L' : 'ml';
  if (goalMl === null || goalMl <= 0) return { value: `${fmt(totalMl)} ${unit}` };
  return { value: fmt(totalMl), total: ` / ${fmt(goalMl)} ${unit}` };
}

const pct = (value: number, target: number) => Math.round(target > 0 ? (value / target) * 100 : 0);
/** Limiar (caracteres) a partir do qual a linha usa a fonte menor. */
const fitOf = (text: string, max: number): GaugeView['fit'] => (text.length > max ? 'long' : 'normal');

// --- macros -----------------------------------------------------------------

export interface MacroInput {
  arcs: Omit<GaugeArc, 'overLabel'>[];
  totals: { kcal: number; protein: number };
  targets: { kcal: number; protein: number };
  hideCalories: boolean;
  /** Modo GLP-1: o texto central passa a ser a proteína contra o piso (a energia continua no arco externo). */
  proteinFloor?: number | null;
}

export function macroView({ arcs, totals, targets, hideCalories, proteinFloor }: MacroInput): GaugeView {
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

  const proteinFirst = hideCalories || (proteinFloor ?? 0) > 0;
  if (proteinFirst) {
    const goal = proteinFloor && proteinFloor > 0 ? proteinFloor : targets.protein;
    const left = Math.round(goal - totals.protein);
    const hit = left <= 0;
    const reached = proteinFloor ? 'piso batido' : 'meta batida';
    const label = hit ? `Proteína · ${reached}` : `Proteína · faltam ${n0(left)} g`;
    const sentence = `Proteína: ${n0(totals.protein)} de ${n0(goal)} g; ${hit ? reached : `faltam ${n0(left)} g`}`;
    const value = n0(totals.protein);
    const total = ` / ${n0(goal)} g`;
    return { arcs: withOver, value, total, label, fit: fitOf(value + total, 13), sentence, ariaLabel: `Macros. ${sentence}. ${description}` };
  }
  const remaining = Math.round(targets.kcal - totals.kcal);
  const label = remaining >= 0 ? `kcal · restam ${n0(remaining)}` : `kcal · ${n0(-remaining)} além da meta`;
  const sentence = `Energia: ${n0(totals.kcal)} de ${n0(targets.kcal)} kcal; ${remaining >= 0 ? `restam ${n0(remaining)} kcal` : `${n0(-remaining)} kcal além da meta`}`;
  const value = n0(totals.kcal);
  const total = ` / ${n0(targets.kcal)}`;
  return { arcs: withOver, value, total, label, fit: fitOf(value + total, 13), sentence, ariaLabel: `Macros. ${sentence}. ${description}` };
}

// --- água -------------------------------------------------------------------

export interface WaterInput {
  totalMl: number;
  goalMl: number | null;
}

/** O status de ritmo ("No ritmo"…) fica no topo da folha de água, não no cluster. */
export function waterView({ totalMl, goalMl }: WaterInput): GaugeView {
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
  const pair = waterPair(totalMl, hasGoal ? goalMl : null);
  const sentence = `Água: ${fmtLiters(totalMl)}${hasGoal ? ` de ${fmtLiters(goalMl)}` : ''}${arc.overLabel ? `, ${arc.overLabel}` : ''}`;
  return { arcs: [arc], ...pair, label: 'Água', fit: fitOf(pair.value + (pair.total ?? ''), 11), sentence, ariaLabel: sentence };
}

// --- movimento --------------------------------------------------------------

export interface MovementInput {
  /** Minutos do dia mostrado. */
  minutes: number;
  /** Meta DIÁRIA (null = sem meta, só os minutos). */
  goalMin: number | null;
  restDay: boolean;
  /** Gasto estimado do dia (já nulo do servidor sem a preferência ou com "esconder calorias"). */
  estimateKcal: number | null;
  hideCalories: boolean;
  isToday: boolean;
}

/**
 * "60/30 min" (minutos do dia / meta diária) e "≈ 370 kcal" (ou "Movimento"). Dia de descanso sem treino:
 * "Descanso", arco neutro. Descanso COM treino: só os minutos, sem meta.
 */
export function movementView({ minutes, goalMin, restDay, estimateKcal, hideCalories, isToday }: MovementInput): GaugeView {
  const hasGoal = !restDay && goalMin !== null && goalMin > 0;
  const resting = restDay && minutes <= 0;
  const over = hasGoal ? Math.max(0, minutes - goalMin) : 0;
  const arc: GaugeArc = {
    key: 'move',
    label: 'Movimento',
    value: minutes,
    target: hasGoal ? goalMin : 0, // sem meta (ou descanso): só a trilha, sem progresso
    // Descanso sem treino: arco neutro (cinza), sem progresso
    from: resting ? 'var(--text-3)' : 'var(--flame)',
    to: resting ? 'var(--text-3)' : 'var(--flame-2)',
    ...(over > 0 ? { overLabel: `${n0(over)} min além da meta` } : {}),
  };
  const estimate = !hideCalories && estimateKcal !== null && estimateKcal > 0 ? estimateKcal : null;
  const when = isToday ? 'de hoje' : 'do dia';
  const parts = [
    resting
      ? `Movimento ${when}: dia de descanso`
      : hasGoal
        ? `Movimento ${when}: ${n0(minutes)} de ${n0(goalMin)} minutos`
        : `Movimento ${when}: ${n0(minutes)} minutos${restDay ? ', dia de descanso' : ''}`,
  ];
  if (estimate !== null) parts.push(`gasto estimado de ${n0(estimate)} calorias`);
  const sentence = parts.join('; ');
  const value = resting ? 'Descanso' : n0(minutes);
  const total = resting ? undefined : hasGoal ? `/${n0(goalMin)} min` : ' min';
  return {
    arcs: [arc],
    value,
    total,
    label: estimate !== null ? `≈ ${n0(estimate)} kcal` : 'Movimento',
    fit: fitOf(value + (total ?? ''), 10),
    sentence,
    ariaLabel: sentence,
  };
}

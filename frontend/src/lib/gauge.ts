/**
 * Matemática pura dos medidores em meia-lua (sem React, sem dependências): arco por raio, comprimento = π·r,
 * dasharray/dashoffset por fração, posição de pontos no arco e layout do cluster da Home.
 * Roda com: npm test (gauge.test.mjs)
 */

/** Arco de 180° da esquerda, sobre o topo, até a direita. Fração 0 = ponta esquerda; 1 = ponta direita. */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Fração preenchida (0 a 1). O arco fecha em 100%: acima disso não existe "segunda volta". */
export const fillFraction = (value: number, target: number) => (target > 0 ? clamp01(value / target) : 0);

/** Quanto passou da meta (0 se não passou ou se não há meta). */
export const overBy = (value: number, target: number) => (target > 0 ? Math.max(0, value - target) : 0);

/** Comprimento de um arco de 180° com raio `r`. */
export const arcLength = (r: number) => Math.PI * r;

/** Valores de stroke-dasharray e stroke-dashoffset para uma fração preenchida. */
export function dash(r: number, fraction: number) {
  const length = arcLength(r);
  return { dasharray: length, dashoffset: length * (1 - clamp01(fraction)) };
}

/** Caminho SVG da meia-lua: do ponto esquerdo ao direito, passando pelo topo. */
export const halfArcPath = (cx: number, cy: number, r: number) => `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

/** Ponto do arco na fração `f` (0 = esquerda, 0,5 = topo, 1 = direita). Serve para a chama que viaja na ponta. */
export function pointOnArc(cx: number, cy: number, r: number, f: number) {
  const theta = Math.PI * clamp01(f);
  return { x: cx - r * Math.cos(theta), y: cy - r * Math.sin(theta) };
}

export interface GaugeGeometry {
  cx: number;
  cy: number;
  /** Altura do viewBox: metade do círculo mais a meia espessura das pontas arredondadas. */
  height: number;
  /** Raio de cada arco, do externo (índice 0) ao interno. */
  radii: number[];
}

/** Geometria de `count` arcos concêntricos num viewBox de largura `size`. */
export function gaugeGeometry(size: number, strokeWidth: number, gap: number, count: number): GaugeGeometry {
  const outer = size / 2 - strokeWidth / 2;
  const radii = Array.from({ length: Math.max(0, count) }, (_, i) => outer - i * (strokeWidth + gap));
  return { cx: size / 2, cy: size / 2, height: size / 2 + strokeWidth / 2, radii };
}

/** Caixa (em %) do vão inferior da meia-lua, onde ficam o ícone, o número e o rótulo. */
export function slotBox(size: number, strokeWidth: number, gap: number, count: number) {
  const { radii, height } = gaugeGeometry(size, strokeWidth, gap, count);
  const innerR = radii[radii.length - 1] ?? size / 2;
  const free = Math.max(0, innerR - strokeWidth / 2 - 1);
  return {
    leftPct: ((size / 2 - free) / size) * 100,
    widthPct: ((free * 2) / size) * 100,
    heightPct: (free / height) * 100,
  };
}

// ---------------------------------------------------------------------------
// Memória do valor anterior (animar "a partir de onde estava")
// ---------------------------------------------------------------------------

export const ringsFromKey = (date: string) => `bocado:ringsFrom:${date}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Frações guardadas por chave de arco. Qualquer problema (sem storage, JSON ruim) vira "sem valor anterior". */
export function readFrom(storage: Pick<Storage, 'getItem'> | undefined, key: string): Record<string, number> {
  try {
    const raw = storage?.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = clamp01(v);
    return out;
  } catch {
    return {};
  }
}

/** Mescla as frações novas às guardadas (os medidores do mesmo dia compartilham a chave). */
export function writeFrom(storage: StorageLike | undefined, key: string, fractions: Record<string, number>) {
  try {
    storage?.setItem(key, JSON.stringify({ ...readFrom(storage, key), ...fractions }));
  } catch {
    /* armazenamento indisponível: só perde a animação a partir do valor anterior */
  }
}

// ---------------------------------------------------------------------------
// Layout do cluster da Home
// ---------------------------------------------------------------------------
// ESPELHO do CSS (.gauge-cluster em globals.css), que é quem manda na tela com container queries. Os valores abaixo
// precisam bater com os de lá; gauge.test.mjs confere as constantes contra o CSS.

export const CLUSTER = {
  /** Espaço entre as colunas (px). */
  gap: 8,
  /** Largura da coluna central em relação a uma lateral (grid 1fr 1.7fr 1fr). */
  centerRatio: 1.7,
  /** Abaixo desta largura do cluster (px), macros em cima e os laterais embaixo. */
  stackBelow: 340,
  /** Tetos no modo empilhado (px). */
  stackedCenter: 190,
  stackedSide: 104,
  /** Altura mínima do bloco de texto abaixo de cada arco (px): igual nas três colunas. */
  textMin: 42,
} as const;

export interface ClusterLayout {
  mode: 'row' | 'stacked';
  /** Largura do medidor central e de cada lateral (px). */
  center: number;
  side: number;
}

/**
 * Larguras para um cluster de `width` px com `sides` laterais (0, 1 ou 2). Em linha, o grid mantém as 3 colunas
 * mesmo com um lateral desligado, para o centro continuar no meio.
 */
export function clusterLayout(width: number, sides: 0 | 1 | 2): ClusterLayout {
  const { gap, centerRatio, stackBelow, stackedCenter, stackedSide } = CLUSTER;
  if (sides > 0 && width < stackBelow) {
    return { mode: 'stacked', center: Math.min(width, stackedCenter), side: Math.min((width - gap) / 2, stackedSide) };
  }
  const unit = (width - gap * 2) / (centerRatio + 2);
  return { mode: 'row', center: unit * centerRatio, side: unit };
}

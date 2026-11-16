/** Divisão de uma refeição entre pessoas da casa. Percentuais inteiros que sempre somam 100. */
export const MIN_PCT = 5;
export const STEP_PCT = 5;

/** Reparte `total` em partes inteiras proporcionais aos pesos (maior resto; empate: o primeiro). */
export function distribute(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const quotas = weights.map((w) => (sum > 0 ? (total * w) / sum : total / weights.length));
  const parts = quotas.map((q) => Math.floor(q + 1e-9));
  let left = total - parts.reduce((a, b) => a + b, 0);
  const order = quotas.map((q, i) => ({ i, frac: q - parts[i] })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts;
}

/** Partes iguais (a sobra vai para as primeiras pessoas): 3 pessoas = 34/33/33. */
export function equalShares(ids: string[]): Record<string, number> {
  const parts = distribute(100, ids.map(() => 1));
  return Object.fromEntries(ids.map((id, i) => [id, parts[i]]));
}

/**
 * Soma `delta` à parte de `id` e redistribui a diferença, proporcionalmente, entre as demais.
 * Ninguém fica abaixo de MIN_PCT; o total continua 100.
 */
export function adjustShare(shares: Record<string, number>, id: string, delta: number): Record<string, number> {
  const ids = Object.keys(shares);
  if (ids.length < 2 || !(id in shares)) return shares;
  const others = ids.filter((k) => k !== id);
  const next = Math.min(Math.max(shares[id] + delta, MIN_PCT), 100 - MIN_PCT * others.length);
  const extraTotal = 100 - next - MIN_PCT * others.length;
  const extras = distribute(extraTotal, others.map((k) => Math.max(shares[k] - MIN_PCT, 0)));
  return { ...Object.fromEntries(others.map((k, i) => [k, MIN_PCT + extras[i]])), [id]: next };
}

/** Atalhos de duas pessoas: `mine` fica com você e o resto com a outra pessoa. */
export function twoWay(meId: string, otherId: string, mine: number): Record<string, number> {
  return { [meId]: mine, [otherId]: 100 - mine };
}

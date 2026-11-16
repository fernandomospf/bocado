/** Funções puras de datas, limites e custo da cota de IA (testáveis sem banco). */

export type ModelPrice = { inPerMTok: number; outPerMTok: number };
export type PriceTable = Record<string, ModelPrice>;

const DTF_CACHE = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string) {
  let f = DTF_CACHE.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    DTF_CACHE.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Diferença (ms) entre a hora de parede em `tz` e o UTC no instante dado. */
export function tzOffsetMs(date: Date, tz: string): number {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Ano, mês (1-12) e dia na hora de parede de `tz`. */
export function zonedParts(date: Date, tz: string) {
  const parts = Object.fromEntries(formatter(tz).formatToParts(date).map((p) => [p.type, p.value]));
  return { y: +parts.year, m: +parts.month, d: +parts.day };
}

/** O instante UTC da meia-noite local do dia (y, m 1-12, d). Dias fora do mês transbordam (d = 32 vira dia 1 seguinte). */
export function zonedMidnightUtc(y: number, m: number, d: number, tz: string): Date {
  const wall = Date.UTC(y, m - 1, d);
  let guess = wall;
  for (let i = 0; i < 3; i++) guess = wall - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** [início, fim) do dia local de `now`. */
export function dayBounds(now: Date, tz: string) {
  const { y, m, d } = zonedParts(now, tz);
  return { start: zonedMidnightUtc(y, m, d, tz), end: zonedMidnightUtc(y, m, d + 1, tz) };
}

/** [início, fim) do mês local de `now`. */
export function monthBounds(now: Date, tz: string) {
  const { y, m } = zonedParts(now, tz);
  return { start: zonedMidnightUtc(y, m, 1, tz), end: zonedMidnightUtc(y, m + 1, 1, tz) };
}

/** Limite efetivo = base x fator (0 = bloqueado, 2 = dobro), sempre inteiro e nunca negativo. */
export function effectiveLimit(base: number, factor: number): number {
  if (!Number.isFinite(factor) || factor <= 0) return 0;
  return Math.max(0, Math.floor(base * factor + 1e-9));
}

/** Custo estimado em dólares, ou null se o modelo não tem preço configurado. */
export function estimateCostUsd(inputTokens: number, outputTokens: number, price: ModelPrice | undefined): number | null {
  if (!price) return null;
  return (inputTokens / 1_000_000) * price.inPerMTok + (outputTokens / 1_000_000) * price.outPerMTok;
}

/** Projeção linear do custo até o fim do mês (custo até agora x duração do mês / tempo decorrido). */
export function projectMonthCost(costSoFar: number, now: Date, monthStart: Date, monthEnd: Date): number | null {
  const elapsed = now.getTime() - monthStart.getTime();
  if (elapsed <= 0) return null;
  return costSoFar * ((monthEnd.getTime() - monthStart.getTime()) / elapsed);
}

/** Lê AI_PRICES_JSON. Devolve a tabela ou um erro legível (nunca inventa preço). */
export function parsePrices(raw: string | undefined): { prices: PriceTable; error?: string } {
  if (!raw || !raw.trim()) return { prices: {} };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { prices: {}, error: 'AI_PRICES_JSON não é um JSON válido' };
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { prices: {}, error: 'AI_PRICES_JSON precisa ser um objeto { "modelo": { "inPerMTok": n, "outPerMTok": n } }' };
  }
  const prices: PriceTable = {};
  for (const [model, v] of Object.entries(data)) {
    const p = v as Partial<ModelPrice> | null;
    const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    if (!p || !ok(p.inPerMTok) || !ok(p.outPerMTok)) {
      return { prices: {}, error: `AI_PRICES_JSON: preço inválido para "${model}" (inPerMTok e outPerMTok precisam ser números >= 0)` };
    }
    prices[model] = { inPerMTok: p.inPerMTok as number, outPerMTok: p.outPerMTok as number };
  }
  return { prices };
}

/** "fernando@gmail.com" -> "f***@gmail.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
}

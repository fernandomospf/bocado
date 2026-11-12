import { jsonrepair } from 'jsonrepair';

const KEYWORDS = new Set(['true', 'false', 'null']);

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

function tryRepair(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return tryParse(jsonrepair(text));
  } catch {
    return { ok: false };
  }
}

/** Reparos específicos para erros vistos na resposta da IA, aplicados antes de uma nova tentativa com jsonrepair. */
function preRepair(text: string): string {
  return text
    .replace(/:\s*([A-Za-z_][\w-]*)\s*([,}\]])/g, (match, word: string, end: string) =>
      KEYWORDS.has(word) ? match : `:"${word}"${end}`,
    )
    .replace(/(:\s*-?\d+(?:\.\d+)?)[A-Za-z_]+/g, '$1');
}

/** JSON.parse tolerante: tenta o texto puro, depois jsonrepair, depois reparos próprios + jsonrepair. Retorna null se nada funcionar. */
export function parseLooseJson(text: string): unknown {
  for (const attempt of [() => tryParse(text), () => tryRepair(text), () => tryRepair(preRepair(text))]) {
    const result = attempt();
    if (result.ok) return result.value;
  }
  return null;
}

/** Último recurso: parseia cada objeto { ... } (sem chaves aninhadas) separadamente, para um item quebrado não derrubar os outros. */
export function extractItemObjects(text: string): unknown[] {
  const out: unknown[] = [];
  for (const [chunk] of text.matchAll(/\{[^{}]*\}/g)) {
    const value = parseLooseJson(chunk);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) out.push(value);
  }
  return out;
}

/** Aceita number ou string ("12,5", "120 g", "5copyright"). Devolve 0 se não houver número finito. */
export function toNumber(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(',', '.').trim()) : NaN;
  return Number.isFinite(n) ? n : 0;
}

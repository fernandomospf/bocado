import type { RawReading, Unit } from './normalize.ts';

/**
 * App Saúde (iPhone): lê o export.xml em pedaços (sem carregar centenas de MB na memória) e extrai só os registros
 * HKQuantityTypeIdentifierBodyMass. Puro: recebe texto, devolve registros. O Web Worker (worker.ts) só alimenta isto com
 * file.stream() + TextDecoder.
 */

export const BODY_MASS = 'HKQuantityTypeIdentifierBodyMass';

const RECORD_TAG = /<Record\b[^>]*>/g;
const ATTR = /([A-Za-z:_][\w:.-]*)="([^"]*)"/g;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(ATTR)) out[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * "2026-11-15 07:30:00 -0300" → o dia no fuso do APARELHO (o instante vale mais que o texto: 23:30 -0300 pode ser
 * já o dia seguinte em outro fuso). `tzOffsetMinutes` existe para testar sem depender do fuso da máquina.
 */
export function localDay(startDate: string, localOffsetMinutes?: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?\s*(?:([+-])(\d{2}):?(\d{2})|Z)?$/.exec(startDate.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '0', sign, oh, om] = m;
  const fileOffset = sign ? (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om)) : null;
  // Sem fuso no texto: o dia escrito é o dia local
  if (fileOffset === null) return `${y}-${mo}-${d}`;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - fileOffset * 60_000;
  const offset = localOffsetMinutes ?? -new Date(utc).getTimezoneOffset();
  const local = new Date(utc + offset * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}

export interface ScanStats {
  /** Registros de peso encontrados. */
  found: number;
  /** Registros BodyMass ignorados por unidade desconhecida ou data ilegível. */
  skipped: number;
}

/**
 * Alimenta com pedaços de texto, na ordem. Um `<Record .../>` pode ser cortado no meio entre dois pedaços: o resto do
 * pedaço anterior fica guardado até o `>` chegar. Registros de outros tipos (passos, batimentos…) são ignorados sem
 * guardar nada.
 */
export class AppleHealthScanner {
  readings: RawReading[] = [];
  stats: ScanStats = { found: 0, skipped: 0 };
  private carry = '';

  private readonly localOffsetMinutes: number | undefined;

  constructor(localOffsetMinutes?: number) {
    this.localOffsetMinutes = localOffsetMinutes;
  }

  push(chunk: string): void {
    const text = this.carry + chunk;
    let consumed = 0;
    for (const m of text.matchAll(RECORD_TAG)) {
      consumed = (m.index ?? 0) + m[0].length;
      if (m[0].includes(BODY_MASS)) this.take(m[0]);
    }
    // O que sobra pode ser o começo de uma tag cortada ("<Rec" ou "<Record type=..." sem o ">"): guarda só isso
    const rest = text.slice(consumed);
    const idx = rest.lastIndexOf('<');
    const tail = idx >= 0 ? rest.slice(idx) : '';
    this.carry = tail && !tail.includes('>') && ('<Record'.startsWith(tail) || tail.startsWith('<Record')) ? tail : '';
    // Tag absurdamente longa sem fechar (arquivo corrompido): não cresce sem limite
    if (this.carry.length > 20_000) this.carry = '';
  }

  private take(tag: string) {
    const a = attrs(tag);
    if (a.type !== BODY_MASS) return;
    const unit = (a.unit ?? '').toLowerCase();
    const value = Number(a.value);
    const day = localDay(a.startDate ?? '', this.localOffsetMinutes);
    const u: Unit | null = unit === 'kg' ? 'kg' : unit === 'lb' ? 'lb' : null;
    if (!u || !day || !Number.isFinite(value)) {
      this.stats.skipped++;
      return;
    }
    this.stats.found++;
    this.readings.push({ date: day, value, unit: u });
  }
}

/** Texto do arquivo (já em memória, só para arquivos pequenos e testes). */
export function scanAppleHealth(xml: string, localOffsetMinutes?: number) {
  const s = new AppleHealthScanner(localOffsetMinutes);
  s.push(xml);
  return { readings: s.readings, stats: s.stats };
}

/** Instruções quando a pessoa envia o .zip do app Saúde (sem biblioteca de zip). */
export const ZIP_HELP =
  'Esse é o arquivo .zip do app Saúde. Toque nele no app Arquivos (ou dê dois cliques no computador) para extrair, abra a pasta apple_health_export e escolha o arquivo export.xml.';

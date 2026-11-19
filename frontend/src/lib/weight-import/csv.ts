import type { RawReading, Unit } from './normalize.ts';

/**
 * Leitura de CSV genérico (pura): detecta separador, cabeçalho, colunas de data e peso, formato da data e unidade.
 * Quando a detecção falha ou a data é ambígua, devolve o que falta para a interface perguntar.
 */

export type Delimiter = ';' | ',' | '\t';
export type DateFormat = 'ymd' | 'dmy' | 'mdy';

export interface CsvTable {
  delimiter: Delimiter;
  hasHeader: boolean;
  header: string[];
  rows: string[][];
}

const DELIMITERS: Delimiter[] = [';', '\t', ','];

/** Conta o separador fora de aspas na linha. */
function countOutsideQuotes(line: string, d: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === d && !q) n++;
  }
  return n;
}

export function detectDelimiter(text: string): Delimiter {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best: Delimiter = ';';
  let bestScore = 0;
  for (const d of DELIMITERS) {
    const counts = lines.map((l) => countOutsideQuotes(l, d));
    const min = Math.min(...counts);
    if (counts.length && min > 0 && min * lines.length > bestScore) {
      bestScore = min * lines.length;
      best = d;
    }
  }
  // Sem consistência entre as linhas: o separador com mais ocorrências na primeira
  if (bestScore === 0 && lines[0]) best = DELIMITERS.reduce((a, b) => (countOutsideQuotes(lines[0], b) > countOutsideQuotes(lines[0], a) ? b : a));
  return best;
}

export function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === d && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

// --- datas ---------------------------------------------------------------------------------------------------------

const ISO = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/;
const SLASHED = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[T,\s].*)?$/;

const pad = (n: number) => String(n).padStart(2, '0');
const fullYear = (y: string) => (y.length === 4 ? Number(y) : Number(y) <= 69 ? 2000 + Number(y) : 1900 + Number(y));

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const iso = `${y}-${pad(m)}-${pad(d)}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return dt.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Os dois primeiros campos de uma data com barras (null se não for no formato DD/MM/AAAA ou MM/DD/AAAA). */
function slashedParts(s: string): { a: number; b: number; y: number } | null {
  const m = SLASHED.exec(s.trim());
  return m ? { a: Number(m[1]), b: Number(m[2]), y: fullYear(m[3]) } : null;
}

/**
 * Formato das datas da coluna. ISO (AAAA-MM-DD) é sempre inequívoco. Com DD/MM ou MM/DD: se algum primeiro campo passa de
 * 12, é DD/MM; se algum segundo passa de 12, é MM/DD; se todos cabem nos dois, é AMBÍGUO e a pessoa escolhe.
 */
export function detectDateFormat(values: string[]): { format: DateFormat | null; ambiguous: boolean } {
  let iso = 0;
  let firstOver12 = false;
  let secondOver12 = false;
  let slashed = 0;
  for (const v of values) {
    if (ISO.test(v.trim())) {
      iso++;
      continue;
    }
    const p = slashedParts(v);
    if (!p) continue;
    slashed++;
    if (p.a > 12) firstOver12 = true;
    if (p.b > 12) secondOver12 = true;
  }
  if (iso > 0 && slashed === 0) return { format: 'ymd', ambiguous: false };
  if (slashed === 0) return { format: null, ambiguous: false };
  if (firstOver12 && !secondOver12) return { format: 'dmy', ambiguous: false };
  if (secondOver12 && !firstOver12) return { format: 'mdy', ambiguous: false };
  if (firstOver12 && secondOver12) return { format: null, ambiguous: false }; // mistura impossível: coluna não é data
  return { format: null, ambiguous: true };
}

/** "2026-11-19", "19/11/2026 07:30", "11/19/2026" → AAAA-MM-DD (o dia que está escrito; a hora é ignorada). */
export function parseDay(value: string, format: DateFormat): string | null {
  const s = value.trim();
  const iso = ISO.exec(s);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const p = slashedParts(s);
  if (!p) return null;
  return format === 'mdy' ? ymd(p.y, p.a, p.b) : ymd(p.y, p.b, p.a);
}

// --- números e unidade -----------------------------------------------------------------------------------------------

/** "80,5", "80.5", "1.234,5", "80,5 kg", "176 lbs" → número (a unidade escrita na célula vem junto). */
export function parseWeightCell(value: string): { value: number; unit: Unit | null } | null {
  let s = value.trim().toLowerCase();
  if (!s) return null;
  let unit: Unit | null = null;
  if (/(lbs?|libras?|pounds?)\s*$/.test(s)) unit = 'lb';
  else if (/(kg|kgs|quilos?)\s*$/.test(s)) unit = 'kg';
  s = s.replace(/[a-zçã\s]+$/g, '').replace(/^["']|["']$/g, '');
  if (!/^[+-]?[\d.,]+$/.test(s)) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    // O último separador é o decimal; o outro é de milhar
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? { value: n, unit } : null;
}

/** Unidade sugerida pelo cabeçalho; sem indicação, kg (a pessoa pode trocar). */
export function unitFromHeader(header: string): Unit | null {
  const h = header.toLowerCase();
  if (/\b(lbs?|libras?|pounds?)\b|\((lbs?)\)/.test(h)) return 'lb';
  if (/\b(kgs?|quilos?)\b|\(kg\)/.test(h)) return 'kg';
  return null;
}

// --- tabela e colunas --------------------------------------------------------------------------------------------------

export function parseCsv(text: string): CsvTable {
  const clean = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(clean);
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  const all = lines.map((l) => splitLine(l, delimiter));
  const first = all[0] ?? [];
  // É cabeçalho se nenhuma célula da primeira linha parece uma data
  const looksLikeData = first.some((c) => ISO.test(c) || SLASHED.test(c));
  const hasHeader = !looksLikeData && first.length > 0;
  return { delimiter, hasHeader, header: hasHeader ? first : first.map((_, i) => `Coluna ${i + 1}`), rows: hasHeader ? all.slice(1) : all };
}

const DATE_NAME = /^(data|date|dia|day|start ?date|datetime|data ?e ?hora|timestamp|medido em|measured)/i;
const WEIGHT_NAME = /(peso|weight|body ?mass|massa|mass)/i;
const NOT_WEIGHT = /(fat|gordura|bmi|imc|water|agua|água|muscle|musc|bone|osso|height|altura)/i;

/** Índices das colunas de data e de peso pelo nome do cabeçalho (-1 quando não achou: a pessoa escolhe). */
export function detectColumns(header: string[], rows: string[][]): { date: number; weight: number } {
  let date = header.findIndex((h) => DATE_NAME.test(h.trim()));
  let weight = header.findIndex((h) => WEIGHT_NAME.test(h) && !NOT_WEIGHT.test(h));
  // Sem nome reconhecível: a coluna cujos valores parecem datas / pesos
  if (date < 0) date = header.findIndex((_, i) => rows.slice(0, 20).filter((r) => r[i] && (ISO.test(r[i]) || SLASHED.test(r[i]))).length >= Math.min(3, rows.length));
  if (weight < 0) {
    weight = header.findIndex((_, i) => {
      if (i === date) return false;
      const cells = rows.slice(0, 20).map((r) => (r[i] ? parseWeightCell(r[i]) : null));
      return cells.length > 0 && cells.filter((c) => c && c.value >= 20 && c.value <= 700).length >= Math.min(3, rows.length);
    });
  }
  return { date, weight };
}

export interface CsvReadOptions {
  dateCol: number;
  weightCol: number;
  format: DateFormat;
  /** Unidade quando a célula não diz nada. */
  unit: Unit;
  /** Coluna opcional com a unidade por linha ("kg", "lb"). */
  unitCol?: number;
}

export function readCsvRows(table: CsvTable, o: CsvReadOptions): { readings: RawReading[]; unreadable: number } {
  const readings: RawReading[] = [];
  let unreadable = 0;
  for (const row of table.rows) {
    const day = row[o.dateCol] ? parseDay(row[o.dateCol], o.format) : null;
    const w = row[o.weightCol] ? parseWeightCell(row[o.weightCol]) : null;
    if (!day || !w) {
      unreadable++;
      continue;
    }
    const rowUnit = o.unitCol !== undefined && o.unitCol >= 0 ? (unitFromHeader(row[o.unitCol] ?? '') ?? (/^lb/i.test(row[o.unitCol] ?? '') ? 'lb' : null)) : null;
    readings.push({ date: day, value: w.value, unit: w.unit ?? rowUnit ?? o.unit });
  }
  return { readings, unreadable };
}

/** Modelo para baixar (separador ";" e vírgula decimal, como o Excel brasileiro). */
export const CSV_TEMPLATE = '﻿data;peso (kg)\r\n15/11/2026;82,4\r\n16/11/2026;82,1\r\n17/11/2026;81,9\r\n';

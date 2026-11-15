/**
 * CSV para o Excel brasileiro: UTF-8 com BOM, separador ";", vírgula decimal, datas DD/MM/AAAA e quebra CRLF.
 * Funções puras (testáveis sem banco).
 */

export const BOM = '﻿';
export const SEP = ';';
export const EOL = '\r\n';

/** Primeiro caractere que faz o Excel/LibreOffice interpretar a célula como fórmula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * Texto livre (nome de alimento, nota): bloqueia injeção de fórmula com um apóstrofo no início e aplica o escape
 * padrão (aspas em volta, aspas internas dobradas) quando há separador, aspas ou quebra de linha.
 * Números gerados pelo próprio app não passam por aqui (um peso "-1,2" precisa continuar número).
 */
export function textCell(value: string | null | undefined): string {
  let v = value ?? '';
  if (FORMULA_START.test(v)) v = `'${v}`;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Número com vírgula decimal e no máximo `digits` casas, sem separador de milhar ("1234,5"). */
export function numCell(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const f = 10 ** digits;
  const rounded = Math.round(value * f) / f;
  return String(Object.is(rounded, -0) ? 0 : rounded).replace('.', ',');
}

/** "2026-11-15" → "15/11/2026". */
export function dateCell(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Junta células já formatadas numa linha (com a quebra CRLF). */
export function row(cells: string[]): string {
  return cells.join(SEP) + EOL;
}

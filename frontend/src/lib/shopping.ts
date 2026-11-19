/**
 * Lista de compras das receitas no app (puro, sem React): quantidades, texto para copiar/compartilhar e CSV no mesmo
 * formato das exportações (UTF-8 com BOM, ";" como separador, vírgula decimal, CRLF, proteção contra fórmulas).
 *
 * PONTO DE EXTENSÃO (não implementado): integrar com um app externo de compras. Um conector futuro entra depois de
 * `shoppingToText`/`shoppingToCsv`, recebendo os mesmos `ShoppingGroup[]` que a API devolve.
 */

export interface ShoppingItem {
  name: string;
  grams: number;
}
export interface ShoppingGroup {
  category: string;
  items: ShoppingItem[];
}
export interface ShoppingList {
  recipes: { id: string; name: string; times: number }[];
  groups: ShoppingGroup[];
  itemCount: number;
}

const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

/** "250 g", "1 kg", "1,2 kg" (a partir de 1000 g, em kg). */
export const fmtQty = (grams: number) => (grams >= 1000 ? `${nf.format(grams / 1000)} kg` : `${nf.format(grams)} g`);

/** Chave de um item para marcar "já tenho em casa" (estado local). */
export const itemKey = (category: string, name: string) => `${category}::${name}`;

/** Texto com quebras de linha: categoria, "- item: quantidade". Os itens já em casa ficam de fora. */
export function shoppingToText(groups: ShoppingGroup[], have: ReadonlySet<string> = new Set()): string {
  const blocks = groups
    .map((g) => {
      const lines = g.items.filter((i) => !have.has(itemKey(g.category, i.name))).map((i) => `- ${i.name}: ${fmtQty(i.grams)}`);
      return lines.length ? `${g.category}\n${lines.join('\n')}` : null;
    })
    .filter((b): b is string => b !== null);
  return ['Lista de compras', ...blocks].join('\n\n');
}

// CSV (mesmas regras de backend/src/export/csv.ts)
const BOM = '﻿';
const SEP = ';';
const EOL = '\r\n';
const FORMULA_START = /^[=+\-@\t\r]/;
function textCell(value: string): string {
  const v = FORMULA_START.test(value) ? `'${value}` : value;
  return /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function shoppingToCsv(groups: ShoppingGroup[]): string {
  const rows = [['Categoria', 'Item', 'Quantidade (g)'].join(SEP) + EOL];
  for (const g of groups) {
    for (const i of g.items) rows.push([textCell(g.category), textCell(i.name), String(i.grams).replace('.', ',')].join(SEP) + EOL);
  }
  return BOM + rows.join('');
}

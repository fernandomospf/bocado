// Lista de compras: quantidades, texto para copiar e CSV (mesmo formato das exportações). Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fmtQty, itemKey, shoppingToCsv, shoppingToText } from './shopping.ts';

const groups = [
  { category: 'Cereais e derivados', items: [{ name: 'Arroz', grams: 1200 }, { name: 'Aveia', grams: 250 }] },
  { category: 'Outros', items: [{ name: '=Molho', grams: 100 }] },
];

describe('quantidades', () => {
  it('em g, ou em kg a partir de 1000 g', () => {
    assert.equal(fmtQty(250), '250 g');
    assert.equal(fmtQty(1000), '1 kg');
    assert.equal(fmtQty(1200), '1,2 kg');
    assert.equal(fmtQty(2550), '2,55 kg');
  });
});

describe('texto para copiar', () => {
  it('quebras de linha, categorias e quantidades', () => {
    assert.equal(
      shoppingToText(groups),
      'Lista de compras\n\nCereais e derivados\n- Arroz: 1,2 kg\n- Aveia: 250 g\n\nOutros\n- =Molho: 100 g',
    );
  });
  it('itens que já estão em casa ficam de fora (e a categoria some se esvaziar)', () => {
    const have = new Set([itemKey('Cereais e derivados', 'Arroz'), itemKey('Cereais e derivados', 'Aveia')]);
    assert.equal(shoppingToText(groups, have), 'Lista de compras\n\nOutros\n- =Molho: 100 g');
  });
});

describe('CSV', () => {
  it('UTF-8 com BOM, ";" e CRLF, e protege contra fórmulas', () => {
    const csv = shoppingToCsv(groups);
    assert.ok(csv.startsWith('﻿Categoria;Item;Quantidade (g)\r\n'));
    assert.ok(csv.includes("Cereais e derivados;Arroz;1200\r\n"));
    assert.ok(csv.includes("Outros;'=Molho;100\r\n"));
  });
});

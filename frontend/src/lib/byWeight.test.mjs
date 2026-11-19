// Prato por quilo: limites do peso e a frase de conferência. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { byWeightLine, parseTotalGrams, sumGrams } from './byWeight.ts';

describe('parseTotalGrams', () => {
  it('aceita 50 a 3000 g, com vírgula ou ponto', () => {
    assert.equal(parseTotalGrams('520'), 520);
    assert.equal(parseTotalGrams('520,5'), 520.5);
    assert.equal(parseTotalGrams('50'), 50);
    assert.equal(parseTotalGrams('3000'), 3000);
  });
  it('fora dos limites ou vazio vira null', () => {
    assert.equal(parseTotalGrams(''), null);
    assert.equal(parseTotalGrams('49'), null);
    assert.equal(parseTotalGrams('3001'), null);
    assert.equal(parseTotalGrams('abc'), null);
  });
});

describe('byWeightLine', () => {
  it('igual à balança', () => {
    const l = byWeightLine(520, 520);
    assert.equal(l.matches, true);
    assert.match(l.text, /^Total: 520 g, igual à balança$/);
  });
  it('depois de editar mostra a diferença, sem bloquear', () => {
    const l = byWeightLine(520, 540);
    assert.equal(l.matches, false);
    assert.equal(l.text, 'Agora 540 g de 520 g');
  });
  it('soma as gramas dos itens', () => {
    assert.equal(sumGrams([{ grams: 100.1 }, { grams: 200.2 }]), 300.3);
    assert.equal(sumGrams([]), 0);
  });
});

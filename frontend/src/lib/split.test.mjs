// Divisão da refeição entre a casa: os percentuais sempre somam 100. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { adjustShare, distribute, equalShares, MIN_PCT, twoWay } from './split.ts';

const total = (s) => Object.values(s).reduce((a, b) => a + b, 0);

describe('equalShares', () => {
  it('soma 100 com qualquer número de pessoas (2 a 6)', () => {
    for (let n = 2; n <= 6; n++) {
      const s = equalShares(Array.from({ length: n }, (_, i) => `u${i}`));
      assert.equal(total(s), 100);
    }
  });
  it('3 pessoas: 34/33/33', () => {
    assert.deepEqual(Object.values(equalShares(['a', 'b', 'c'])), [34, 33, 33]);
  });
});

describe('adjustShare', () => {
  it('2 pessoas: +5 numa tira 5 da outra', () => {
    assert.deepEqual(adjustShare({ a: 50, b: 50 }, 'a', 5), { b: 45, a: 55 });
  });
  it('3 ou mais: redistribui proporcionalmente e mantém 100', () => {
    const out = adjustShare({ a: 40, b: 40, c: 20 }, 'a', 10);
    assert.equal(total(out), 100);
    assert.equal(out.a, 50);
    assert.ok(out.b > out.c);
  });
  it('nunca deixa ninguém abaixo do mínimo nem passa de 100', () => {
    let s = { a: 50, b: 30, c: 20 };
    for (let i = 0; i < 30; i++) s = adjustShare(s, 'a', 5);
    assert.equal(total(s), 100);
    assert.ok(Object.values(s).every((v) => v >= MIN_PCT));
    for (let i = 0; i < 30; i++) s = adjustShare(s, 'a', -5);
    assert.equal(total(s), 100);
    assert.ok(Object.values(s).every((v) => v >= MIN_PCT));
  });
  it('todas as combinações de passos mantêm 100', () => {
    let s = equalShares(['a', 'b', 'c', 'd']);
    for (let i = 0; i < 200; i++) {
      s = adjustShare(s, ['a', 'b', 'c', 'd'][i % 4], i % 3 === 0 ? -5 : 5);
      assert.equal(total(s), 100);
    }
  });
});

describe('twoWay e distribute', () => {
  it('60/40 e 70/30', () => {
    assert.deepEqual(twoWay('me', 'x', 60), { me: 60, x: 40 });
    assert.equal(total(twoWay('me', 'x', 70)), 100);
  });
  it('distribute sem pesos úteis divide por igual', () => {
    assert.deepEqual(distribute(10, [0, 0]), [5, 5]);
  });
});

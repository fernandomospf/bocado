// Remoção otimista no cache do dia. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withoutItems } from './dayCache.ts';

const item = (id, kcal, protein = 1.05, carbs = 2, fat = 0.33) => ({ id, name: id, grams: 100, kcal, protein, carbs, fat, estimated: false });
const meal = (id, items) => ({ id, date: '2026-11-15', type: 'LUNCH', source: 'MANUAL', note: null, createdAt: '', items, totals: null });
const day = {
  date: '2026-11-15',
  targets: null,
  totals: { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  meals: [meal('m1', [item('a', 100.4), item('b', 50.4)]), meal('m2', [item('c', 300)])],
};

describe('withoutItems', () => {
  it('tira um item e recalcula os totais da refeição e do dia', () => {
    const out = withoutItems(day, 'm1', ['a']);
    assert.deepEqual(out.meals[0].items.map((i) => i.id), ['b']);
    assert.deepEqual(out.meals[0].totals, { kcal: 50, protein: 1.1, carbs: 2, fat: 0.3 });
    assert.deepEqual(out.totals, { kcal: 350, protein: 2.1, carbs: 4, fat: 0.7 });
  });

  it('a refeição que fica vazia some', () => {
    const out = withoutItems(day, 'm2', ['c']);
    assert.deepEqual(out.meals.map((m) => m.id), ['m1']);
    assert.equal(out.totals.kcal, 151);
  });

  it('sem itemIds remove a refeição inteira', () => {
    const out = withoutItems(day, 'm1');
    assert.deepEqual(out.meals.map((m) => m.id), ['m2']);
    assert.equal(out.totals.kcal, 300);
  });

  it('não altera o objeto original', () => {
    withoutItems(day, 'm1', ['a']);
    assert.equal(day.meals[0].items.length, 2);
  });
});

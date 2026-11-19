// Retorno sem culpa: quando o card aparece e some. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { returnCardVisible } from './returnCard.ts';

const last = (days, date = '2026-11-10') => ({ lastLogDate: date, daysSinceLastLog: days });

describe('returnCardVisible', () => {
  it('aparece com 3 dias ou mais sem registrar e nada registrado hoje', () => {
    assert.equal(returnCardVisible({ last: last(3), loggedToday: false, dismissedFor: null }), true);
    assert.equal(returnCardVisible({ last: last(30), loggedToday: false, dismissedFor: null }), true);
  });
  it('não aparece com menos de 3 dias, conta nova ou enquanto carrega', () => {
    assert.equal(returnCardVisible({ last: last(2), loggedToday: false, dismissedFor: null }), false);
    assert.equal(returnCardVisible({ last: last(0), loggedToday: false, dismissedFor: null }), false);
    assert.equal(returnCardVisible({ last: { lastLogDate: null, daysSinceLastLog: null }, loggedToday: false, dismissedFor: null }), false);
    assert.equal(returnCardVisible({ last: undefined, loggedToday: false, dismissedFor: null }), false);
  });
  it('some ao registrar algo hoje', () => {
    assert.equal(returnCardVisible({ last: last(5), loggedToday: true, dismissedFor: null }), false);
  });
  it('dispensar vale uma vez por retorno; um retorno novo (outro último registro) mostra de novo', () => {
    assert.equal(returnCardVisible({ last: last(5, '2026-11-10'), loggedToday: false, dismissedFor: '2026-11-10' }), false);
    assert.equal(returnCardVisible({ last: last(4, '2026-12-01'), loggedToday: false, dismissedFor: '2026-11-10' }), true);
  });
});

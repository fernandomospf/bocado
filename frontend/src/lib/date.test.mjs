// Testes de lib/date.ts com o runner nativo do Node (24+ remove os tipos sozinho): npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weekDays, weekStart } from './date.ts';

// Novembro de 2026: dia 15 é domingo, 16 é segunda
describe('weekStart', () => {
  it('semana começando na segunda', () => {
    assert.equal(weekStart('2026-11-16', 'MONDAY'), '2026-11-16'); // a própria segunda
    assert.equal(weekStart('2026-11-18', 'MONDAY'), '2026-11-16'); // quarta
    assert.equal(weekStart('2026-11-15', 'MONDAY'), '2026-11-09'); // domingo fecha a semana anterior
  });

  it('semana começando no domingo', () => {
    assert.equal(weekStart('2026-11-15', 'SUNDAY'), '2026-11-15'); // o próprio domingo
    assert.equal(weekStart('2026-11-21', 'SUNDAY'), '2026-11-15'); // sábado
    assert.equal(weekStart('2026-11-16', 'SUNDAY'), '2026-11-15'); // segunda
  });

  it('atravessa mês e ano', () => {
    assert.equal(weekStart('2027-01-01', 'MONDAY'), '2026-12-28'); // sexta
    assert.equal(weekStart('2027-01-01', 'SUNDAY'), '2026-12-27');
  });

  it('usa segunda quando a preferência não vem', () => {
    assert.equal(weekStart('2026-11-15'), '2026-11-09');
  });
});

describe('weekDays', () => {
  it('devolve 7 dias consecutivos a partir do início', () => {
    const days = weekDays('2026-11-18', 'SUNDAY');
    assert.deepEqual(days, [
      '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21',
    ]);
  });
});

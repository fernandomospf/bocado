// Testes de lib/date.ts com o runner nativo do Node (24+ remove os tipos sozinho): npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addMonths, monthEnd, monthStart, pillLabel, weekStart } from './date.ts';

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

describe('pillLabel', () => {
  it('Hoje, Ontem e dia da semana com número', () => {
    assert.equal(pillLabel('2026-11-15', '2026-11-15'), 'Hoje');
    assert.equal(pillLabel('2026-11-14', '2026-11-15'), 'Ontem');
    assert.equal(pillLabel('2026-11-13', '2026-11-15'), 'Sex 13');
    assert.equal(pillLabel('2026-11-02', '2026-11-15', true), 'Seg 2 nov');
  });
});

describe('meses', () => {
  it('início e fim do mês, inclusive fevereiro bissexto', () => {
    assert.equal(monthStart('2026-11-15'), '2026-11-01');
    assert.equal(monthEnd('2026-11-15'), '2026-11-30');
    assert.equal(monthEnd('2028-02-10'), '2028-02-29');
  });

  it('addMonths limita ao último dia do mês e atravessa o ano', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
    assert.equal(addMonths('2026-01-10', -1), '2025-12-10');
  });
});

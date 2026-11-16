// Contador de água: status, formatação e pontinhos. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dotState, expectedFraction, fmtMl, isWellOver, LAST_ML_KEY, readLastMl, STATUS_LABEL, waterStatus } from './water.ts';

describe('expectedFraction', () => {
  it('0 às 7h, 1 às 21h, linear no meio', () => {
    assert.equal(expectedFraction(6), 0);
    assert.equal(expectedFraction(7), 0);
    assert.equal(expectedFraction(14), 0.5);
    assert.equal(expectedFraction(21), 1);
    assert.equal(expectedFraction(23), 1);
  });
});

describe('waterStatus', () => {
  const at = (hour, totalMl, goalMl = 2000, minute = 0) => waterStatus({ totalMl, goalMl, hour, minute });

  it('meta batida (>= 100%) vale a qualquer hora', () => {
    assert.equal(at(6, 2000), 'done');
    assert.equal(at(23, 2600), 'done');
    assert.equal(at(14, 2000), 'done');
  });
  it('no ritmo: progresso >= esperado - 15 pontos percentuais', () => {
    // 14h: esperado 50%; limite 35%
    assert.equal(at(14, 700), 'onTrack'); // 35% exato
    assert.equal(at(14, 698), 'nudge');
    assert.equal(at(14, 1500), 'onTrack');
  });
  it('hora de um copo d\'água quando está abaixo do ritmo', () => {
    assert.equal(at(20, 600), 'nudge'); // esperado ~93%
    assert.equal(at(12, 0), 'nudge'); // esperado 36%: 0% < 21%
  });
  it('fora de 8h às 21h só mostra o progresso (sem status de ritmo)', () => {
    assert.equal(at(7, 0), 'plain');
    assert.equal(at(7, 0, 2000, 59), 'plain');
    assert.equal(at(8, 0), 'onTrack'); // 8h: esperado 7% -> 0 >= -8%
    assert.equal(at(21, 100), 'plain');
    assert.equal(at(22, 100), 'plain');
  });
  it('sem meta (ainda precisa definir), só o progresso', () => {
    assert.equal(waterStatus({ totalMl: 500, goalMl: null, hour: 15 }), 'plain');
  });
  it('rótulos sem culpa', () => {
    for (const label of Object.values(STATUS_LABEL)) assert.doesNotMatch(label, /falhou|atrasad|preguiça|culpa|ruim/i);
    assert.equal(STATUS_LABEL.nudge, "Hora de um copo d'água");
  });
});

describe('pontinhos, formatação e valor usado por último', () => {
  it('dotState: batido, parcial, sem registro', () => {
    assert.equal(dotState({ totalMl: 2500, goalMl: 2500 }), 'hit');
    assert.equal(dotState({ totalMl: 400, goalMl: 2500 }), 'partial');
    assert.equal(dotState({ totalMl: 0, goalMl: 2500 }), 'none');
    assert.equal(dotState(undefined), 'none');
    assert.equal(dotState({ totalMl: 300, goalMl: null }), 'partial');
  });
  it('isWellOver: acima de 150% da meta', () => {
    assert.equal(isWellOver(3000, 2000), false);
    assert.equal(isWellOver(3001, 2000), true);
    assert.equal(isWellOver(5000, null), false);
  });
  it('fmtMl usa ponto de milhar (pt-BR)', () => {
    assert.equal(fmtMl(1200), '1.200');
    assert.equal(fmtMl(2600), '2.600');
    assert.equal(fmtMl(800), '800');
  });
  it('readLastMl: valor guardado válido ou 200', () => {
    const store = (v) => ({ getItem: (k) => (k === LAST_ML_KEY ? v : null) });
    assert.equal(readLastMl(store('300')), 300);
    assert.equal(readLastMl(store(null)), 200);
    assert.equal(readLastMl(store('10')), 200);
    assert.equal(readLastMl(store('abc')), 200);
    assert.equal(readLastMl(undefined), 200);
  });
});

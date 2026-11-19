// Modo GLP-1: texto central de proteína, aviso semanal e resumo do bem-estar. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lowIntakeDue, lowIntakeVisible, WELLBEING_SCALES, wellbeingSummaryLines } from './glp1.ts';
import { macroView } from './gaugeModel.ts';

const arcs = [
  { key: 'kcal', label: 'Energia', value: 1200, target: 1800, from: 'a', to: 'b' },
  { key: 'protein', label: 'Proteína', value: 78, target: 100, from: 'a', to: 'b' },
];

describe('macroView no modo GLP-1', () => {
  const base = { arcs, totals: { kcal: 1200, protein: 78 }, targets: { kcal: 1800, protein: 100 } };

  it('prioriza a proteína contra o piso, mesmo com as calorias visíveis (a energia segue no arco)', () => {
    const v = macroView({ ...base, hideCalories: false, proteinFloor: 120 });
    assert.equal(v.value, '78');
    assert.equal(v.total, ' / 120 g');
    assert.match(v.label, /^Proteína · faltam 42 g$/);
    assert.ok(v.arcs.some((a) => a.key === 'kcal'));
    assert.doesNotMatch(v.sentence, /kcal/);
  });
  it('piso batido', () => {
    const v = macroView({ ...base, totals: { kcal: 1500, protein: 125 }, hideCalories: false, proteinFloor: 120 });
    assert.equal(v.label, 'Proteína · piso batido');
  });
  it('sem o modo, o texto central segue sendo a energia', () => {
    const v = macroView({ ...base, hideCalories: false });
    assert.equal(v.value, '1.200');
    assert.match(v.label, /^kcal · restam 600$/);
  });
});

describe('aviso de baixa ingestão: no máximo uma vez por semana', () => {
  it('nunca mostrado: aparece; no mesmo dia continua visível; depois some até 7 dias', () => {
    assert.equal(lowIntakeDue(null, '2026-11-19'), true);
    assert.equal(lowIntakeVisible('2026-11-19', '2026-11-19'), true);
    assert.equal(lowIntakeVisible('2026-11-19', '2026-11-20'), false);
    assert.equal(lowIntakeVisible('2026-11-19', '2026-11-25'), false);
    assert.equal(lowIntakeVisible('2026-11-19', '2026-11-26'), true);
  });
});

describe('bem-estar', () => {
  it('as 4 escalas têm 4 rótulos neutros', () => {
    assert.deepEqual(WELLBEING_SCALES.map((s) => s.key), ['nausea', 'appetite', 'energy', 'gi']);
    for (const s of WELLBEING_SCALES) assert.equal(s.labels.length, 4);
  });
  it('resumo da semana em frases neutras', () => {
    const l = wellbeingSummaryLines({ loggedDays: 4, nausea: [2, 1, 0], gi: [0, 0, 0] });
    assert.deepEqual(l, ['Náusea leve em 2 dias, moderada em 1 dia']);
    assert.match(wellbeingSummaryLines({ loggedDays: 3, nausea: [0, 0, 0], gi: [1, 0, 0] })[0], /^Desconforto intestinal leve em 1 dia$/);
    assert.match(wellbeingSummaryLines({ loggedDays: 3, nausea: [0, 0, 0], gi: [0, 0, 0] })[0], /3 dias/);
  });
});

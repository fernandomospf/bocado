// Jejum: formatação e progresso (neutros). Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { endedLine, fastLine, fastProgress, fmtDuration, fromLocalInput, toLocalInput, FAST_PRESETS } from './fasting.ts';

const H = 3_600_000;
const M = 60_000;

describe('formatação', () => {
  it('"11h20", "16h" e "35 min"', () => {
    assert.equal(fmtDuration(11 * H + 20 * M), '11h20');
    assert.equal(fmtDuration(16 * H), '16h');
    assert.equal(fmtDuration(5 * H + 5 * M), '5h05');
    assert.equal(fmtDuration(35 * M), '35 min');
    assert.equal(fmtDuration(-5 * M), '0 min');
  });
  it('a linha da Home e a de encerramento (sem palavras de culpa)', () => {
    const start = '2026-11-19T00:00:00.000Z';
    const now = Date.parse(start) + 11 * H + 20 * M;
    assert.equal(fastLine(start, 16, now), 'Janela de jejum · 11h20 de 16h');
    assert.equal(endedLine(680), 'Jejum encerrado · 11h20');
    for (const text of [fastLine(start, 16, now), endedLine(680)]) assert.doesNotMatch(text, /quebr|falh|sequência/i);
  });
  it('presets 12, 14, 16 e 18', () => {
    assert.deepEqual([...FAST_PRESETS], [12, 14, 16, 18]);
  });
});

describe('progresso', () => {
  const start = '2026-11-19T00:00:00.000Z';
  const at = (ms) => Date.parse(start) + ms;
  it('de 0 a 1, e passou da meta só enche a barra', () => {
    assert.equal(fastProgress(start, 16, at(-H)), 0);
    assert.equal(fastProgress(start, 16, at(8 * H)), 0.5);
    assert.equal(fastProgress(start, 16, at(20 * H)), 1);
  });
});

describe('horário local', () => {
  it('ida e volta do datetime-local preserva o instante (guardado em UTC)', () => {
    const iso = '2026-11-19T13:45:00.000Z';
    assert.equal(fromLocalInput(toLocalInput(iso)), iso);
    assert.equal(fromLocalInput('lixo'), null);
  });
});

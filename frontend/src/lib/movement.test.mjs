// Movimento e Home: chama, passo da meta, cabeçalhos dos dropdowns, aberto/fechado e vocabulário sem culpa. Roda com: npm test
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  activitiesSummary,
  easeOutCubic,
  flameState,
  isSectionOpen,
  mealsSummary,
  moveFromKey,
  moveGoalToastKey,
  readSections,
  sectionsKey,
  stepGoal,
  writeSection,
} from './movement.ts';

describe('chama', () => {
  it('apagada sem minutos; queimando entre 0 e 100% com calor contínuo; acesa só ao fechar a meta', () => {
    assert.deepEqual(flameState(0, 150), { state: 'off', heat: 0 });
    const a = flameState(30, 150);
    const b = flameState(120, 150);
    assert.equal(a.state, 'burning');
    assert.ok(b.heat > a.heat, 'esquenta com o progresso');
    assert.equal(flameState(149, 150).state, 'burning');
    assert.deepEqual(flameState(150, 150), { state: 'lit', heat: 1 });
  });

  it('meta reduzida e deixando de bater volta ao normal; sem meta nunca acende', () => {
    assert.equal(flameState(100, 90).state, 'lit');
    assert.equal(flameState(100, 120).state, 'burning');
    assert.equal(flameState(500, null).state, 'burning');
  });

  it('ease-out: começa rápido e termina em 1', () => {
    assert.equal(easeOutCubic(0), 0);
    assert.equal(easeOutCubic(1), 1);
    assert.ok(easeOutCubic(0.5) > 0.5);
  });

  it('chaves de armazenamento por semana', () => {
    assert.equal(moveFromKey('2026-11-16'), 'bocado:moveFrom:2026-11-16');
    assert.notEqual(moveGoalToastKey('2026-11-16'), moveGoalToastKey('2026-11-23'));
  });
});

describe('stepper da meta (15 em 15, de 30 a 600)', () => {
  it('sobe e desce 15 e respeita os limites', () => {
    assert.equal(stepGoal(150, 1), 165);
    assert.equal(stepGoal(150, -1), 135);
    assert.equal(stepGoal(30, -1), 30);
    assert.equal(stepGoal(600, 1), 600);
    assert.equal(stepGoal(595, 1), 600);
  });
  it('valor fora do passo encaixa no próximo múltiplo de 15; sem meta parte de 150', () => {
    assert.equal(stepGoal(155, 1), 165);
    assert.equal(stepGoal(155, -1), 150);
    assert.equal(stepGoal(null, 1), 165);
  });
});

describe('cabeçalhos dos dropdowns', () => {
  it('Refeições: resumo com kcal e, sem calorias, com proteína', () => {
    assert.equal(mealsSummary({ items: 12, kcal: 1538, protein: 111, hideCalories: false }), '12 itens · 1.538 kcal');
    assert.equal(mealsSummary({ items: 12, kcal: 1538, protein: 111, hideCalories: true }), '12 itens · P 111 g');
    assert.equal(mealsSummary({ items: 1, kcal: 90, protein: 4, hideCalories: false }), '1 item · 90 kcal');
    assert.equal(mealsSummary({ items: 0, kcal: 0, protein: 0, hideCalories: false }), '');
  });

  it('Atividades: treinos, minutos e estimativa só quando existe e sem "esconder calorias"', () => {
    const one = [{ durationMin: 60, estimateKcal: 280 }];
    assert.equal(activitiesSummary({ workouts: one, hideCalories: false, isToday: true }), '1 treino · 60 min · ≈ 280 kcal (estimativa)');
    assert.equal(activitiesSummary({ workouts: one, hideCalories: true, isToday: true }), '1 treino · 60 min');
    assert.equal(activitiesSummary({ workouts: [{ durationMin: 30 }, { durationMin: 45 }], hideCalories: false, isToday: true }), '2 treinos · 75 min');
    assert.equal(activitiesSummary({ workouts: [], hideCalories: false, isToday: true }), 'nenhum treino hoje');
    assert.equal(activitiesSummary({ workouts: [], hideCalories: false, isToday: false }), 'nenhum treino neste dia');
  });
});

describe('aberto/fechado dos dropdowns', () => {
  const fake = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('padrão: Refeições aberto; Atividades aberto só com treino no dia', () => {
    assert.equal(isSectionOpen('meals', {}, { hasWorkouts: false }), true);
    assert.equal(isSectionOpen('activities', {}, { hasWorkouts: false }), false);
    assert.equal(isSectionOpen('activities', {}, { hasWorkouts: true }), true);
  });

  it('o estado manual vale sobre o padrão e é guardado por usuário', () => {
    const s = fake();
    writeSection(s, sectionsKey('u1'), 'activities', false);
    writeSection(s, sectionsKey('u1'), 'meals', false);
    const manual = readSections(s, sectionsKey('u1'));
    assert.equal(isSectionOpen('activities', manual, { hasWorkouts: true }), false);
    assert.equal(isSectionOpen('meals', manual, { hasWorkouts: false }), false);
    assert.deepEqual(readSections(s, sectionsKey('u2')), {});
    assert.equal(sectionsKey('u1'), 'bocado:home:sections:u1');
    s.setItem('ruim', '{"meals":"sim"}');
    assert.deepEqual(readSections(s, 'ruim'), {});
  });
});

describe('vocabulário sem culpa nos arquivos novos', () => {
  it('nenhum texto novo usa "queimou", "queimadas", "compensar" (fora do aviso que nega) ou vermelho de julgamento', () => {
    const root = new URL('../', import.meta.url);
    const files = [
      'components/GaugeCluster.tsx',
      'components/HalfGauge.tsx',
      'components/MovementGauge.tsx',
      'components/MovementSheet.tsx',
      'components/MovementPrefs.tsx',
      'components/MovementGoalControls.tsx',
      'components/CollapsibleSection.tsx',
      'components/DayCompositionSheet.tsx',
      'lib/gaugeModel.ts',
      'lib/movement.ts',
    ];
    for (const f of files) {
      const src = readFileSync(new URL(f, root), 'utf8');
      assert.doesNotMatch(src, /queimou|queimad|falhou/i, f);
      assert.doesNotMatch(src, /--danger|#ff0000|\bred\b/i, f);
      // "compensar" só aparece negado: "Não é um valor para compensar o que você comeu."
      for (const m of src.matchAll(/[^\n]*compensar[^\n]*/gi)) assert.match(m[0], /Não é um valor para compensar/, f);
    }
    assert.ok(readdirSync(new URL('components/', root)).includes('Rings.tsx'), 'Rings continua existindo');
  });
});

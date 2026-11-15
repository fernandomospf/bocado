// Lógica do item de gordura de preparo: substituir, nunca duplicar. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyFatChoice, guessText, isFatItem, nextFatState } from './preparationFat.ts';

const portion = (grams, kcal, fat, label, carbs = 0) => ({ grams, portion: label, kcal, protein: 0, carbs, fat });
const table = {
  oil: { label: 'óleo', little: portion(5, 44.2, 5, '1 colher de chá'), lots: portion(15, 132.6, 15, '1 colher de sopa') },
  butter: { label: 'manteiga', little: portion(5, 36.3, 4.1, '1 colher de chá'), lots: portion(15, 108.9, 12.4, '1 colher de sopa') },
  sauce: { label: 'molho', little: portion(20, 60.4, 6.1, '1 colher de sopa cheia', 1.6), lots: portion(50, 151.1, 15.3, '3 colheres de sopa', 4) },
};
const food = (key, name) => ({ key, name, grams: '100', kcal: '100', protein: '1', carbs: '1', fat: '1', estimated: true });
const base = [food('a', 'Arroz'), food('b', 'Frango')];
const fats = (items) => items.filter(isFatItem);

describe('applyFatChoice', () => {
  it('cria um único item no fim, sem selo de estimativa', () => {
    const out = applyFatChoice(base, { level: 'little', kind: 'oil' }, table);
    assert.equal(out.length, 3);
    assert.deepEqual(out.slice(0, 2), base);
    const f = out[2];
    assert.equal(f.name, 'Gordura de preparo (óleo, 1 colher de chá)');
    assert.equal(f.kcal, '44,2');
    assert.equal(f.grams, '5');
    assert.equal(f.estimated, false);
  });

  it('trocar nível e tipo substitui no mesmo lugar e mantém a key', () => {
    const first = applyFatChoice(base, { level: 'little', kind: 'oil' }, table);
    const key = fats(first)[0].key;
    const withNew = [...first, food('c', 'Salada')]; // alimento adicionado depois da gordura
    let out = applyFatChoice(withNew, { level: 'lots', kind: 'oil' }, table);
    out = applyFatChoice(out, { level: 'lots', kind: 'sauce' }, table);
    assert.equal(fats(out).length, 1);
    assert.equal(out.length, 4);
    assert.equal(out[2].key, key);
    assert.equal(out[2].name, 'Gordura de preparo (molho, 3 colheres de sopa)');
    assert.equal(out[2].carbs, '4');
    assert.equal(out[3].name, 'Salada');
  });

  it('"Nada" remove o item; sem item, devolve a mesma lista', () => {
    const withFat = applyFatChoice(base, { level: 'lots', kind: 'butter' }, table);
    assert.deepEqual(applyFatChoice(withFat, { level: 'none', kind: 'butter' }, table), base);
    assert.equal(applyFatChoice(base, { level: 'none', kind: 'oil' }, table), base);
  });

  it('limpa duplicatas antigas, se existirem', () => {
    const dup = [...base, { ...food('x', 'g1'), kind: 'preparationFat' }, { ...food('y', 'g2'), kind: 'preparationFat' }];
    const out = applyFatChoice(dup, { level: 'little', kind: 'butter' }, table);
    assert.equal(fats(out).length, 1);
    assert.equal(fats(out)[0].key, 'x');
  });
});

describe('nextFatState', () => {
  const guess = (level, kind) => ({ level, kind, reason: '' });

  it('sem comida cozida não mostra a pergunta (ou mantém a anterior)', () => {
    assert.equal(nextFatState(null, false, guess('little', 'oil')), null);
    const prev = { guess: guess('lots', 'oil'), choice: { level: 'lots', kind: 'oil' }, touched: false };
    assert.equal(nextFatState(prev, false, guess('none', 'unknown')), prev);
  });

  it('pré-seleciona o palpite; "unknown" vira óleo', () => {
    assert.deepEqual(nextFatState(null, true, guess('little', 'unknown')).choice, { level: 'little', kind: 'oil' });
  });

  it('reanálise: novo palpite substitui a seleção, a menos que o usuário já tenha escolhido', () => {
    const auto = { guess: guess('little', 'oil'), choice: { level: 'little', kind: 'oil' }, touched: false };
    assert.deepEqual(nextFatState(auto, true, guess('lots', 'butter')).choice, { level: 'lots', kind: 'butter' });

    const manual = { ...auto, choice: { level: 'none', kind: 'oil' }, touched: true };
    const next = nextFatState(manual, true, guess('lots', 'butter'));
    assert.deepEqual(next.choice, { level: 'none', kind: 'oil' });
    assert.deepEqual(next.guess, guess('lots', 'butter'));
    assert.equal(next.touched, true);
  });
});

describe('guessText', () => {
  it('descreve o palpite', () => {
    assert.equal(guessText({ level: 'little', kind: 'oil', reason: '' }), 'A IA achou: um pouco de óleo');
    assert.equal(guessText({ level: 'lots', kind: 'unknown', reason: '' }), 'A IA achou: bastante gordura');
    assert.equal(guessText({ level: 'none', kind: 'unknown', reason: '' }), 'A IA achou: sem gordura no preparo');
  });
});

// Modo "esconder calorias": formatação, espelho local, atributo do <html> e <KcalView>. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  applyHideAttr,
  fmtKcal,
  HIDE_CALORIES_ATTR,
  HIDE_CALORIES_INLINE_SCRIPT,
  HIDE_CALORIES_KEY,
  KcalView,
  readStoredHide,
  resolveHide,
  writeStoredHide,
} from './kcal.ts';

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};

describe('fmtKcal', () => {
  it('formata com unidade e arredonda', () => {
    assert.equal(fmtKcal(1234.6), '1.235 kcal');
    assert.equal(fmtKcal(0), '0 kcal');
  });
  it('sem unidade, só o número', () => {
    assert.equal(fmtKcal(540, false, false), '540');
  });
  it('com o modo ligado devolve texto vazio', () => {
    assert.equal(fmtKcal(540, true), '');
    assert.equal(fmtKcal(540, true, false), '');
  });
});

describe('<Kcal> (KcalView)', () => {
  const html = (props) => renderToStaticMarkup(createElement('div', null, KcalView(props)));
  it('mostra o valor quando as calorias estão visíveis', () => {
    assert.equal(html({ value: 540, hidden: false }), '<div><span class="num">540 kcal</span></div>');
    assert.equal(html({ value: 540, hidden: false, unit: false, className: 'big' }), '<div><span class="num big">540</span></div>');
  });
  it('não renderiza nada com o modo ligado', () => {
    assert.equal(KcalView({ value: 540, hidden: true }), null);
    assert.equal(html({ value: 540, hidden: true }), '<div></div>');
  });
});

describe('espelho local e resolução (lógica do useDisplayPrefs)', () => {
  it('o servidor manda; sem ele vale o espelho', () => {
    assert.equal(resolveHide(undefined, true), true);
    assert.equal(resolveHide(undefined, false), false);
    assert.equal(resolveHide(false, true), false);
    assert.equal(resolveHide(true, false), true);
  });
  it('grava e lê o espelho; desligar remove a chave', () => {
    const s = memory();
    assert.equal(readStoredHide(s), false);
    writeStoredHide(s, true);
    assert.equal(s.m.get(HIDE_CALORIES_KEY), '1');
    assert.equal(readStoredHide(s), true);
    writeStoredHide(s, false);
    assert.equal(s.m.has(HIDE_CALORIES_KEY), false);
    assert.equal(readStoredHide(s), false);
  });
  it('armazenamento indisponível não quebra', () => {
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    assert.equal(readStoredHide(broken), false);
    writeStoredHide(broken, true);
    assert.equal(readStoredHide(undefined), false);
  });
  it('liga e desliga o atributo no <html>', () => {
    const attrs = new Map();
    const root = { setAttribute: (n, v) => attrs.set(n, v), removeAttribute: (n) => attrs.delete(n) };
    applyHideAttr(root, true);
    assert.equal(attrs.has(HIDE_CALORIES_ATTR), true);
    applyHideAttr(root, false);
    assert.equal(attrs.has(HIDE_CALORIES_ATTR), false);
  });
  it('o script inline aplica o atributo só com o espelho ligado', () => {
    for (const [value, expected] of [['1', true], [null, false]]) {
      const attrs = new Map();
      const localStorage = { getItem: () => value };
      const document = { documentElement: { setAttribute: (n, v) => attrs.set(n, v) } };
      new Function('localStorage', 'document', HIDE_CALORIES_INLINE_SCRIPT)(localStorage, document);
      assert.equal(attrs.has(HIDE_CALORIES_ATTR), expected);
    }
    assert.ok(HIDE_CALORIES_INLINE_SCRIPT.length < 200);
  });
});

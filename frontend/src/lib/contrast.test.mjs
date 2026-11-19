// Contraste AA dos tokens (claro, escuro, menos transparência e alto contraste), lido direto do globals.css.
// Texto: 4,5:1. Ícones e bordas de controles: 3:1. Roda com: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

/** Corpo do primeiro bloco que começa com `selector {` (aceita um nível de @media por fora). */
function block(selector, from = 0) {
  const start = css.indexOf(selector, from);
  assert.ok(start >= 0, `bloco não encontrado: ${selector}`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error('bloco sem fim');
}

function tokens(body) {
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function color(v) {
  const hex = /^#([0-9a-f]{6})$/i.exec(v);
  if (hex) return { r: parseInt(hex[1].slice(0, 2), 16), g: parseInt(hex[1].slice(2, 4), 16), b: parseInt(hex[1].slice(4, 6), 16), a: 1 };
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(v);
  assert.ok(rgb, `cor não reconhecida: ${v}`);
  return { r: +rgb[1], g: +rgb[2], b: +rgb[3], a: rgb[4] === undefined ? 1 : +rgb[4] };
}

const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const light = tokens(block(':root {'));
const darkStart = css.indexOf('@media (prefers-color-scheme: dark)');
const dark = { ...light, ...tokens(block(':root {', darkStart)) };

/** Superfícies onde o texto pode cair: fundo, a luz colorida do fundo, o vidro por cima dela e os preenchimentos. */
function surfaces(t) {
  const bg = color(t['--bg']);
  const glows = ['--glow-1', '--glow-2', '--glow-3'].map((k) => over({ ...color(t[k]), a: 0.85 }, bg));
  const base = [bg, ...glows];
  const out = [...base];
  for (const b of base) {
    out.push(over(color(t['--glass']), b), over(color(t['--glass-strong']), b), over(color(t['--fill']), b), over(color(t['--fill-strong']), b));
  }
  return out;
}

/** Páginas e cartões comuns (sem a luz colorida pura do fundo): onde texto colorido de verdade aparece. */
function plain(t) {
  const bg = color(t['--bg']);
  return [bg, ...['--glass', '--glass-strong', '--fill', '--fill-strong'].map((k) => over(color(t[k]), bg))];
}

function worst(fgToken, t, surfs = surfaces(t)) {
  const fg = color(t[fgToken]);
  return Math.min(...surfs.map((s) => ratio(over(fg, s), s)));
}

for (const [name, t] of [['claro', light], ['escuro', dark]]) {
  describe(`tokens ${name}`, () => {
    it('texto principal, secundário e terciário >= 4,5:1 sobre o fundo, a luz, o vidro e os preenchimentos', () => {
      const bad = ['--text', '--text-2', '--text-3'].map((k) => [k, worst(k, t)]).filter(([, r]) => r < 4.5);
      assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
    });
    it('azul de texto (links e botões de texto), perigo, sucesso e água >= 4,5:1', () => {
      const bad = ['--accent-text', '--danger', '--success', '--water-text', '--ring-kcal-text', '--ring-protein-text', '--ring-carbs-text', '--ring-fat-text'].map((k) => [k, worst(k, t, plain(t))]).filter(([, r]) => r < 4.5);
      assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
    });
    it('texto branco sobre o preenchimento de botões (--accent) >= 4,5:1', () => {
      const r = ratio(color(t['--accent-ink']), color(t['--accent']));
      assert.ok(r >= 4.5, `accent-ink sobre accent: ${r.toFixed(2)}`);
    });
    it('ícones e traços de controles (--accent-text, --text-3) >= 3:1', () => {
      const bad = ['--accent-text', '--text-3'].map((k) => [k, worst(k, t, plain(t))]).filter(([, r]) => r < 3);
      assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
    });
  });
}

describe('menos transparência (vidro sólido)', () => {
  const body = tokens(block("html[data-reduce-transparency] {"));
  const darkBody = tokens(block('html[data-reduce-transparency] {', css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf("html[data-reduce-transparency] {"))));
  for (const [name, base, over2] of [['claro', light, body], ['escuro', dark, darkBody]]) {
    it(`${name}: texto >= 4,5:1 sobre o vidro sólido e os preenchimentos`, () => {
      const t = { ...base, ...over2 };
      const solids = [t['--glass'], t['--glass-strong'], t['--fill'], t['--fill-strong']].map(color);
      const bad = ['--text', '--text-2', '--text-3', '--accent-text'].map((k) => [k, Math.min(...solids.map((s) => ratio(over(color(t[k]), s), s)))]).filter(([, r]) => r < 4.5);
      assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
    });
  }
});

describe('alto contraste', () => {
  const lightHc = tokens(block("html[data-contrast='more'] {"));
  const darkHc = tokens(block("html[data-contrast='more'] {", css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf("html[data-contrast='more'] {"))));
  it('claro: texto >= 7:1 (AAA) sobre os fundos sólidos', () => {
    const t = { ...light, ...tokens(block("html[data-reduce-transparency] {")), ...lightHc };
    const solids = [t['--bg'], t['--glass'], t['--glass-strong'], t['--fill'], t['--fill-strong']].map(color);
    const bad = ['--text', '--text-2', '--text-3', '--accent-text'].map((k) => [k, Math.min(...solids.map((s) => ratio(color(t[k]), s)))]).filter(([, r]) => r < 7);
    assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
  });
  it('escuro: texto >= 7:1 (AAA) sobre os fundos sólidos', () => {
    const darkTr = tokens(block('html[data-reduce-transparency] {', css.indexOf('@media (prefers-color-scheme: dark)', css.indexOf("html[data-reduce-transparency] {"))));
    const t = { ...dark, ...darkTr, ...darkHc };
    const solids = [t['--bg'], t['--glass'], t['--glass-strong'], t['--fill'], t['--fill-strong']].map(color);
    const bad = ['--text', '--text-2', '--text-3', '--accent-text'].map((k) => [k, Math.min(...solids.map((s) => ratio(color(t[k]), s)))]).filter(([, r]) => r < 7);
    assert.deepEqual(bad.map(([k, r]) => `${k} ${r.toFixed(2)}`), []);
  });
});

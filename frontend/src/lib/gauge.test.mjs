// Medidores em meia-lua: matemática dos arcos, memória do valor anterior, layout do cluster e textos (modo sem calorias). Roda com: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  arcLength,
  CLUSTER,
  clusterLayout,
  dash,
  fillFraction,
  gaugeGeometry,
  halfArcPath,
  overBy,
  pointOnArc,
  readFrom,
  ringsFromKey,
  slotBox,
  writeFrom,
} from './gauge.ts';
import { fmtLiters, macroView, movementView, waterPair, waterView } from './gaugeModel.ts';
import { ringSpecs } from '../components/ringSpecs.ts';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

describe('arcos: 0%, 50%, 100% e acima de 100%', () => {
  const r = 50;
  it('comprimento = π·r', () => close(arcLength(r), Math.PI * 50));

  it('dashoffset por fração', () => {
    const len = arcLength(r);
    close(dash(r, 0).dashoffset, len);
    close(dash(r, 0.5).dashoffset, len / 2);
    close(dash(r, 1).dashoffset, 0);
    close(dash(r, 0).dasharray, len);
  });

  it('acima de 100% o arco fecha em 100% (sem segunda volta) e o excesso é informado à parte', () => {
    assert.equal(fillFraction(150, 100), 1);
    close(dash(r, fillFraction(150, 100)).dashoffset, 0);
    assert.equal(overBy(150, 100), 50);
    assert.equal(overBy(100, 100), 0);
    assert.equal(overBy(80, 100), 0);
  });

  it('sem meta (0) ou valores inválidos: arco vazio', () => {
    assert.equal(fillFraction(50, 0), 0);
    assert.equal(fillFraction(-5, 100), 0);
    assert.equal(fillFraction(Number.NaN, 100), 0);
    assert.equal(overBy(50, 0), 0);
  });

  it('caminho: da esquerda, sobre o topo, até a direita; pontos do arco', () => {
    assert.equal(halfArcPath(100, 100, 80), 'M 20 100 A 80 80 0 0 1 180 100');
    const start = pointOnArc(100, 100, 80, 0);
    const top = pointOnArc(100, 100, 80, 0.5);
    const end = pointOnArc(100, 100, 80, 1);
    close(start.x, 20);
    close(start.y, 100);
    close(top.x, 100);
    close(top.y, 20);
    close(end.x, 180);
    close(end.y, 100, 1e-9);
  });
});

describe('geometria concêntrica', () => {
  it('raios do externo ao interno, espaçados por espessura + vão', () => {
    const g = gaugeGeometry(200, 10, 3, 4);
    assert.deepEqual(g.radii, [95, 82, 69, 56]);
    assert.equal(g.cx, 100);
    assert.equal(g.height, 105);
  });

  it('o vão central cabe dentro do arco mais interno', () => {
    const box = slotBox(200, 10, 3, 4);
    assert.ok(box.widthPct > 0 && box.widthPct < 100);
    close(box.leftPct * 2 + box.widthPct, 100); // centralizado
    assert.ok(box.heightPct > 0 && box.heightPct <= 100);
  });
});

describe('memória do valor anterior (sessionStorage)', () => {
  const fake = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
  };

  it('a chave segue o padrão bocado:ringsFrom:<data>', () => assert.equal(ringsFromKey('2026-11-17'), 'bocado:ringsFrom:2026-11-17'));

  it('guarda e mescla frações; ignora lixo e sem storage', () => {
    const s = fake();
    writeFrom(s, 'k', { kcal: 0.4 });
    writeFrom(s, 'k', { water: 0.7 });
    assert.deepEqual(readFrom(s, 'k'), { kcal: 0.4, water: 0.7 });
    s.setItem('k2', 'não é json');
    assert.deepEqual(readFrom(s, 'k2'), {});
    s.setItem('k3', JSON.stringify({ a: 7, b: 'x', c: -1 }));
    assert.deepEqual(readFrom(s, 'k3'), { a: 1, c: 0 });
    assert.deepEqual(readFrom(undefined, 'k'), {});
  });
});

describe('layout do cluster', () => {
  // Largura útil do card na Hoje: tela − 2×18 (padding da tela) − 2×16 (padding do .gauge-card); no desktop, a coluna de 380px − 2×16
  const inner = (screen) => Math.min(screen, 560) - 36 - 32;
  const desktop = 380 - 32;

  it('402 e 390px: três medidores em linha, centro 1,7x o lateral, dentro do card', () => {
    assert.equal(clusterLayout(inner(402), 2).mode, 'row');
    const l = clusterLayout(inner(390), 2);
    assert.equal(l.mode, 'row');
    close(l.center / l.side, CLUSTER.centerRatio);
    assert.ok(l.side >= 80 && l.side <= 95, `lateral ${l.side}`);
    assert.ok(l.center >= 135 && l.center <= 160, `centro ${l.center}`);
    close(l.side * 2 + l.center + CLUSTER.gap * 2, inner(390), 1e-6); // ocupa exatamente o card, sem estourar
  });

  it('360 e 320px: macros em cima e laterais lado a lado embaixo', () => {
    for (const w of [360, 320]) {
      const l = clusterLayout(inner(w), 2);
      assert.equal(l.mode, 'stacked', `${w}px`);
      assert.ok(l.center <= inner(w));
      assert.ok(l.side * 2 + CLUSTER.gap <= inner(w) + 0.001);
    }
  });

  it('coluna sticky do desktop: em linha, dentro do espaço', () => {
    const l = clusterLayout(desktop, 2);
    assert.equal(l.mode, 'row');
    assert.ok(l.side >= 88 && l.center >= 150, `${l.side} / ${l.center}`);
    assert.ok(l.side * 2 + l.center + CLUSTER.gap * 2 <= desktop + 0.001);
  });

  it('com 1 ou 0 laterais o centro continua no meio (3 colunas) e macros sozinho nunca empilha', () => {
    const w = inner(390);
    assert.deepEqual(clusterLayout(w, 1), clusterLayout(w, 2));
    assert.equal(clusterLayout(250, 0).mode, 'row');
    assert.equal(clusterLayout(250, 1).mode, 'stacked');
  });

  it('o CSS espelha as constantes (gap, colunas, ponto de quebra, tetos, altura do texto)', () => {
    const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');
    assert.match(css, new RegExp(`--g-gap: ${CLUSTER.gap}px`));
    assert.match(css, new RegExp(`grid-template-columns: minmax\\(0, 1fr\\) minmax\\(0, ${CLUSTER.centerRatio}fr\\) minmax\\(0, 1fr\\)`));
    assert.match(css, new RegExp(`@container \\(max-width: ${CLUSTER.stackBelow - 1}px\\)`));
    assert.match(css, new RegExp(`width: min\\(100%, ${CLUSTER.stackedCenter}px\\)`));
    assert.match(css, new RegExp(`width: min\\(100%, ${CLUSTER.stackedSide}px\\)`));
    assert.match(css, new RegExp(`min-height: ${CLUSTER.textMin}px`));
    assert.match(css, /container-type: inline-size/);
  });
});

describe('energia (centro)', () => {
  const targets = { kcal: 2400, protein: 194, carbs: 220, fat: 70 };
  const view = (totals, hideCalories) => macroView({ arcs: ringSpecs(totals, targets, hideCalories), totals, targets, hideCalories });

  it('quatro arcos (Energia no externo); "271 / 2.400" e "kcal · restam 2.129"', () => {
    const v = view({ kcal: 271, protein: 34, carbs: 30, fat: 10 }, false);
    assert.deepEqual(v.arcs.map((a) => a.key), ['kcal', 'protein', 'carbs', 'fat']);
    assert.equal(v.value, '271');
    assert.equal(v.total, ' / 2.400');
    assert.equal(v.label, 'kcal · restam 2.129');
    assert.equal(v.fit, 'normal');
  });

  it('faixas: zero, exatamente na meta, acima da meta (cor normal, "além da meta")', () => {
    assert.equal(view({ kcal: 0, protein: 0, carbs: 0, fat: 0 }, false).label, 'kcal · restam 2.400');
    assert.equal(view({ kcal: 2400, protein: 0, carbs: 0, fat: 0 }, false).label, 'kcal · restam 0');
    const over = view({ kcal: 2520, protein: 100, carbs: 100, fat: 30 }, false);
    assert.equal(over.label, 'kcal · 120 além da meta');
    assert.equal(over.arcs[0].overLabel, '120 kcal além da meta');
    assert.equal(over.arcs[1].overLabel, undefined);
  });

  it('números grandes: "12.345 / 12.000", marcados como longos (a fonte reduz)', () => {
    const t = { kcal: 12000, protein: 194, carbs: 220, fat: 70 };
    const v = macroView({ arcs: ringSpecs({ kcal: 12345, protein: 1, carbs: 1, fat: 1 }, t, false), totals: { kcal: 12345, protein: 1 }, targets: t, hideCalories: false });
    assert.equal(`${v.value}${v.total}`, '12.345 / 12.000');
    assert.equal(v.fit, 'long');
    assert.equal(v.label, 'kcal · 345 além da meta');
  });

  it('sem calorias: proteína no centro ("34 / 194 g", "Proteína · faltam 160 g") e nenhuma kcal', () => {
    const v = view({ kcal: 3000, protein: 34, carbs: 100, fat: 30 }, true);
    assert.deepEqual(v.arcs.map((a) => a.key), ['protein', 'carbs', 'fat']);
    assert.equal(`${v.value}${v.total}`, '34 / 194 g');
    assert.equal(v.label, 'Proteína · faltam 160 g');
    assert.doesNotMatch(JSON.stringify(v), /kcal|Energia|calor/i);
    const hit = view({ kcal: 0, protein: 200, carbs: 0, fat: 0 }, true);
    assert.equal(hit.label, 'Proteína · meta batida');
    assert.doesNotMatch(JSON.stringify(hit), /kcal|Energia|calor/i);
  });
});

describe('água', () => {
  it('litros: 1200 → "1,2 L", 800 → "800 ml"', () => {
    assert.equal(fmtLiters(1200), '1,2 L');
    assert.equal(fmtLiters(800), '800 ml');
  });

  it('par consumido / meta na mesma unidade: L a partir de 1 L, ml abaixo', () => {
    assert.deepEqual(waterPair(1200, 2600), { value: '1,2', total: ' / 2,6 L' });
    assert.deepEqual(waterPair(800, 2600), { value: '800', total: ' / 2.600 ml' });
    assert.deepEqual(waterPair(0, 2600), { value: '0', total: ' / 2.600 ml' });
    assert.deepEqual(waterPair(1000, 2000), { value: '1', total: ' / 2 L' });
    assert.deepEqual(waterPair(3050, 2600), { value: '3,1', total: ' / 2,6 L' });
    assert.deepEqual(waterPair(500, null), { value: '500 ml' });
  });

  it('rótulo "Água", sem status no cluster; excesso neutro', () => {
    const w = waterView({ totalMl: 1200, goalMl: 2600 });
    assert.equal(w.label, 'Água');
    assert.doesNotMatch(JSON.stringify(w), /ritmo|copo/);
    assert.equal(waterView({ totalMl: 800, goalMl: 2600 }).fit, 'long');
    assert.equal(waterView({ totalMl: 3000, goalMl: 2600 }).arcs[0].overLabel, '400 ml além da meta');
    assert.equal(waterView({ totalMl: 500, goalMl: null }).arcs[0].target, 0);
  });
});

describe('movimento (dia)', () => {
  const base = { minutes: 60, goalMin: 30, restDay: false, estimateKcal: 370, hideCalories: false, isToday: true };

  it('"60/30 min" e "≈ 370 kcal"; aria-label completo', () => {
    const m = movementView(base);
    assert.equal(`${m.value}${m.total}`, '60/30 min');
    assert.equal(m.label, '≈ 370 kcal');
    // O nome acessível começa pelo texto visível (WCAG 2.5.3) e termina com a leitura completa
    assert.ok(m.ariaLabel.startsWith('60/30 min'));
    assert.ok(m.ariaLabel.endsWith('Movimento de hoje: 60 de 30 minutos; gasto estimado de 370 calorias'));
    assert.equal(m.arcs[0].target, 30);
    assert.equal(m.arcs[0].overLabel, '30 min além da meta');
  });

  it('estimativa desligada (null do servidor) ou com "esconder calorias": "Movimento", sem kcal', () => {
    assert.equal(movementView({ ...base, estimateKcal: null }).label, 'Movimento');
    const hidden = movementView({ ...base, hideCalories: true });
    assert.equal(hidden.label, 'Movimento');
    assert.doesNotMatch(JSON.stringify(hidden), /kcal|calorias/i);
  });

  it('sem meta: só os minutos, sem progresso', () => {
    const m = movementView({ ...base, goalMin: null, estimateKcal: null });
    assert.equal(`${m.value}${m.total}`, '60 min');
    assert.equal(m.arcs[0].target, 0);
    assert.ok(m.ariaLabel.startsWith('60 min Movimento'));
    assert.ok(m.ariaLabel.endsWith('Movimento de hoje: 60 minutos'));
  });

  it('descanso sem treino: "Descanso" / "Movimento", arco neutro; descanso com treino: minutos sem meta', () => {
    const rest = movementView({ ...base, minutes: 0, restDay: true, estimateKcal: null });
    assert.equal(rest.value, 'Descanso');
    assert.equal(rest.total, undefined);
    assert.equal(rest.label, 'Movimento');
    assert.equal(rest.arcs[0].target, 0);
    assert.equal(rest.arcs[0].from, 'var(--text-3)');
    const restWith = movementView({ ...base, restDay: true });
    assert.equal(`${restWith.value}${restWith.total}`, '60 min');
    assert.equal(restWith.arcs[0].target, 0);
    assert.match(restWith.ariaLabel, /dia de descanso/);
  });

  it('dia passado: "do dia" em vez de "de hoje"', () => {
    assert.match(movementView({ ...base, isToday: false }).ariaLabel, /Movimento do dia: 60 de 30 minutos/);
  });

  it('números grandes ("240/240 min") marcados como longos', () => {
    assert.equal(movementView({ ...base, minutes: 240, goalMin: 240 }).fit, 'long');
    assert.equal(movementView(base).fit, 'normal');
  });
});

describe('vocabulário', () => {
  it('nenhum texto dos medidores usa vocabulário de culpa', () => {
    const all = JSON.stringify([
      macroView({ arcs: ringSpecs({ kcal: 9, protein: 9, carbs: 9, fat: 9 }, { kcal: 1, protein: 1, carbs: 1, fat: 1 }), totals: { kcal: 9, protein: 9 }, targets: { kcal: 1, protein: 1 }, hideCalories: false }),
      waterView({ totalMl: 5000, goalMl: 2000 }),
      movementView({ minutes: 900, goalMin: 30, restDay: false, estimateKcal: 900, hideCalories: false, isToday: true }),
      movementView({ minutes: 0, goalMin: 30, restDay: true, estimateKcal: null, hideCalories: false, isToday: true }),
    ]);
    assert.doesNotMatch(all, /queimou|queimad|compensar|falhou|vermelho|red/i);
  });
});

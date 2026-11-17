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
import { fmtLiters, macroView, movementView, waterView } from './gaugeModel.ts';
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
  // Largura útil do card na Hoje: tela − 2×18 (padding da tela) − 2×6 (padding do .gauge-card); no desktop, a coluna de 380px − 2×6
  const inner = (screen) => Math.min(screen, 560) - 36 - 12;
  const desktop = 380 - 12;

  it('390px: três medidores em linha, centro 1,7x o lateral, dentro do card', () => {
    const l = clusterLayout(inner(390), 2);
    assert.equal(l.mode, 'row');
    close(l.center / l.side, CLUSTER.centerRatio);
    assert.ok(l.side >= 85 && l.side <= 95, `lateral ${l.side}`);
    assert.ok(l.center >= 145 && l.center <= 160, `centro ${l.center}`);
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
    assert.ok(l.side >= 90 && l.center >= 155, `${l.side} / ${l.center}`);
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
    assert.match(css, new RegExp(`grid-template-columns: 1fr ${CLUSTER.centerRatio}fr 1fr`));
    assert.match(css, new RegExp(`@container \\(max-width: ${CLUSTER.stackBelow - 1}px\\)`));
    assert.match(css, new RegExp(`width: min\\(100%, ${CLUSTER.stackedCenter}px\\)`));
    assert.match(css, new RegExp(`width: min\\(100%, ${CLUSTER.stackedSide}px\\)`));
    assert.match(css, new RegExp(`min-height: ${CLUSTER.textMin}px`));
    assert.match(css, /container-type: inline-size/);
  });
});

describe('macros (centro)', () => {
  const targets = { kcal: 2000, protein: 150, carbs: 220, fat: 70 };
  const view = (totals, hideCalories) => macroView({ arcs: ringSpecs(totals, targets, hideCalories), totals, targets, hideCalories });

  it('quatro arcos, do externo ao interno: Energia, Proteína, Carboidratos, Gorduras', () => {
    const v = view({ kcal: 1191, protein: 102, carbs: 100, fat: 30 }, false);
    assert.deepEqual(v.arcs.map((a) => a.key), ['kcal', 'protein', 'carbs', 'fat']);
    assert.equal(v.sentence, 'Restam 809 kcal');
    assert.equal(v.label, 'Restam');
    assert.equal(v.value, '809 kcal');
  });

  it('passou da meta: dado neutro, "X kcal além da meta" e marcador só nos arcos que passaram', () => {
    const v = view({ kcal: 2300, protein: 100, carbs: 100, fat: 30 }, false);
    assert.equal(v.sentence, '300 kcal além da meta');
    assert.equal(v.arcs[0].overLabel, '300 kcal além da meta');
    assert.equal(v.arcs[1].overLabel, undefined);
  });

  it('sem calorias: 3 arcos (Proteína no externo) e nenhuma kcal em lugar nenhum', () => {
    const v = view({ kcal: 3000, protein: 102, carbs: 100, fat: 30 }, true);
    assert.deepEqual(v.arcs.map((a) => a.key), ['protein', 'carbs', 'fat']);
    assert.equal(v.sentence, 'Proteína: faltam 48 g');
    assert.equal(v.value, '48 g');
    assert.doesNotMatch(JSON.stringify(v), /kcal|Energia|calor/i);
    assert.equal(view({ kcal: 0, protein: 150, carbs: 0, fat: 0 }, true).sentence, 'Meta de proteína batida');
    assert.doesNotMatch(JSON.stringify(view({ kcal: 0, protein: 190, carbs: 0, fat: 0 }, true)), /kcal|Energia|calor/i);
  });
});

describe('água e movimento', () => {
  it('litros: 1200 → "1,2 L", 800 → "800 ml"', () => {
    assert.equal(fmtLiters(1200), '1,2 L');
    assert.equal(fmtLiters(2600), '2,6 L');
    assert.equal(fmtLiters(800), '800 ml');
  });

  it('água: valor e rótulo curtos, sem status no cluster; excesso neutro', () => {
    const w = waterView({ totalMl: 1200, goalMl: 2600 });
    assert.equal(w.value, '1,2 L');
    assert.equal(w.label, 'Água');
    assert.equal(waterView({ totalMl: 800, goalMl: 2600 }).value, '800 ml');
    assert.doesNotMatch(JSON.stringify(w), /ritmo|copo/);
    assert.equal(waterView({ totalMl: 3000, goalMl: 2600 }).arcs[0].overLabel, '400 ml além da meta');
    assert.equal(waterView({ totalMl: 500, goalMl: null }).arcs[0].target, 0);
  });

  it('movimento: "90/150" e "Movimento"; unidade e semana só no aria-label; nunca kcal no cluster', () => {
    const m = movementView({ doneMin: 90, goalMin: 150 });
    assert.equal(m.value, '90/150');
    assert.equal(m.label, 'Movimento');
    assert.equal(m.ariaLabel, 'Movimento da semana: 90 de 150 min');
    assert.doesNotMatch(JSON.stringify(m), /kcal/i);
  });

  it('movimento sem meta: só os minutos, sem progresso; acima da meta: "X min além da meta"', () => {
    const none = movementView({ doneMin: 45, goalMin: null });
    assert.equal(none.value, '45 min');
    assert.equal(none.arcs[0].target, 0);
    assert.equal(movementView({ doneMin: 180, goalMin: 150 }).arcs[0].overLabel, '30 min além da meta');
  });

  it('nenhum texto novo usa vocabulário de culpa', () => {
    const all = JSON.stringify([
      macroView({ arcs: ringSpecs({ kcal: 9, protein: 9, carbs: 9, fat: 9 }, { kcal: 1, protein: 1, carbs: 1, fat: 1 }), totals: { kcal: 9, protein: 9 }, targets: { kcal: 1, protein: 1 }, hideCalories: false }),
      waterView({ totalMl: 5000, goalMl: 2000 }),
      movementView({ doneMin: 900, goalMin: 150 }),
    ]);
    assert.doesNotMatch(all, /queimou|queimad|compensar|falhou|vermelho|red/i);
  });
});

// E2E de rolagem horizontal: nenhuma tela logada nem Sheet pode ficar mais larga que o celular.
// Para cada rota e cada Sheet, em 390x844, 360x800 e 320x700, claro e escuro, afirma:
//   - document.documentElement.scrollWidth <= innerWidth (a largura do aparelho: no Chrome mobile o innerWidth
//     CRESCE junto com o conteúdo largo, então comparamos com a largura configurada da viewport);
//   - nenhum elemento visível passa de clientWidth + 1 (nem left < -1), fora dos containers que rolam/cortam
//     na horizontal de propósito (faixa de chips etc.). html e body NÃO contam como contenção: a rede de segurança
//     `overflow-x: clip` deles não pode esconder um estouro real;
//   - nenhum container rola de lado (fora a faixa de chips) e nenhum texto fica cortado na borda de um card/Sheet
//     que recorta (sem reticências).
// Com dados "ruins": nomes de 60+ caracteres sem espaço, 12.345 kcal, 6 itens numa refeição, "esconder calorias" e
// texto aumentado em 130%.
//
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3000 node --test e2e/overflow.e2e.mjs
// OVERFLOW_REPORT=1 só lista os estouros (elemento raiz de cada um), sem falhar. E2E_QUICK=1 roda só 320 e 390 claro.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD ?? 'senha-e2e-bocado';
const REPORT = !!process.env.OVERFLOW_REPORT;
const QUICK = !!process.env.E2E_QUICK;

const VIEWPORTS = QUICK
  ? [{ width: 390, height: 844 }, { width: 320, height: 700 }]
  : [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 320, height: 700 }];
const SCHEMES = QUICK ? ['light'] : ['light', 'dark'];

const LONG_FOOD = 'Feijoadacompletacomcouvelaranjafarofabaconlinguicacalabresaetorresmocrocante';
const LONG_RECIPE = 'Escondidinhodemandiocacomcarnesecadesfiadaqueijocoalhoemanteigadegarrafa';

const USERS = {
  bad: { email: 'e2e-overflow@example.test', prefs: { hideCalories: false, workoutEstimateEnabled: true, waterEnabled: true, movementEnabled: true, movementDailyGoalMin: 30 } },
  hide: { email: 'e2e-overflow-hide@example.test', prefs: { hideCalories: true, workoutEstimateEnabled: true, waterEnabled: true, movementEnabled: true, movementDailyGoalMin: 30 } },
};

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

/** Telas: rota + (opcional) ação que abre uma Sheet. */
const SCREENS = [
  { name: 'Hoje', path: '/' },
  { name: 'Histórico', path: '/history' },
  { name: 'Receitas', path: '/recipes' },
  { name: 'Receita (detalhe)', path: 'recipe' },
  { name: 'Perfil', path: '/profile' },
  { name: 'Nova refeição', path: '/add' },
  { name: 'Calendário', path: '/', open: (p) => p.getByRole('button', { name: 'Escolher dia' }).click() },
  { name: 'Sheet treino', path: '/', open: async (p) => {
    await p.getByRole('button', { name: 'Adicionar' }).dispatchEvent('click');
    await p.getByRole('menuitem', { name: /treino/i }).dispatchEvent('click');
  } },
  { name: 'Sheet água', path: '/', open: (p) => p.locator('.gauge-cell-water .gauge-btn').click() },
  { name: 'Sheet movimento', path: '/', open: (p) => p.locator('.gauge-cell-move .gauge-btn').click() },
  { name: 'Sheet composição', path: '/', open: (p) => p.locator('.gauge-cell-center .gauge-btn').click() },
  { name: 'Sheet item', path: '/', open: (p) => p.locator('.list-row', { hasText: 'Feijoada' }).first().dispatchEvent('click') },
];

let browser;
const states = {};
let recipeId = null;

async function launch() {
  try {
    return await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
  } catch {
    return chromium.launch();
  }
}

/** Cria (uma vez) o usuário com dados "ruins" e guarda a sessão. */
async function session(key) {
  if (states[key]) return states[key];
  const user = USERS[key];
  const ctx = await browser.newContext();
  const req = ctx.request;
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email: user.email, password: PASSWORD } });
  if (!res.ok()) {
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: 'Teste Overflow', email: user.email, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro: ${res.status()} ${await res.text()}`);
    await req.put(`${BASE}/api/profile`, {
      data: { sex: 'MALE', birthDate: '1988-03-02', heightCm: 180, weightKg: 85, activityLevel: 'MODERATE', goal: 'MAINTAIN' },
    });
  }
  await req.patch(`${BASE}/api/profile/preferences`, { data: user.prefs });

  const day = await (await req.get(`${BASE}/api/days/${today}`)).json();
  if (day.meals.length === 0) {
    const item = (name, kcal, protein, carbs, fat) => ({ name, grams: 100, kcal, protein, carbs, fat });
    // 6 itens numa refeição, nome longo sem espaço e 12.345 kcal no dia
    const meal = await req.post(`${BASE}/api/meals`, {
      data: {
        date: today,
        type: 'LUNCH',
        items: [
          item(LONG_FOOD, 6000, 300, 600, 250),
          item('Arroz', 6345, 120, 900, 60),
          item('Feijão', 140, 9, 25, 1),
          item('Salada', 30, 1, 5, 0),
          item('Suco de laranja natural sem açúcar', 110, 1, 26, 0),
          item('Pudim', 300, 6, 45, 10),
        ],
      },
    });
    assert.ok(meal.ok(), `refeição: ${meal.status()} ${await meal.text()}`);
    await req.post(`${BASE}/api/workouts`, { data: { date: today, type: 'STRENGTH', durationMin: 75, intensity: 'HIGH' } });
    await req.post(`${BASE}/api/water`, { data: { date: today, amountMl: 1200 } });
  }

  const recipes = await (await req.get(`${BASE}/api/recipes`)).json();
  let recipe = Array.isArray(recipes) ? recipes.find((r) => r.name === LONG_RECIPE) : null;
  if (!recipe) {
    const r = await req.post(`${BASE}/api/recipes`, {
      data: {
        name: LONG_RECIPE,
        servings: 4,
        ingredients: [
          { name: LONG_FOOD, grams: 500, kcal: 900, protein: 50, carbs: 100, fat: 30 },
          { name: 'Mandioca', grams: 600, kcal: 960, protein: 8, carbs: 230, fat: 2 },
        ],
      },
    });
    assert.ok(r.ok(), `receita: ${r.status()} ${await r.text()}`);
    recipe = await r.json();
  }
  recipeId = recipe?.id ?? recipeId;

  states[key] = await ctx.storageState();
  await ctx.close();
  return states[key];
}

/** Simula o texto do sistema aumentado (o CSS usa px; o Android escala todo texto, então escalamos o computado). */
async function scaleText(page, factor) {
  await page.evaluate((f) => {
    const els = [...document.querySelectorAll('body *')];
    const sizes = els.map((e) => {
      const cs = getComputedStyle(e);
      return [parseFloat(cs.fontSize), cs.lineHeight];
    });
    els.forEach((e, i) => {
      const [fs, lh] = sizes[i];
      e.style.fontSize = `${fs * f}px`;
      if (lh.endsWith('px')) e.style.lineHeight = `${parseFloat(lh) * f}px`;
    });
  }, factor);
}

/** No navegador: largura da página e elementos visíveis que passam da tela (só os RAÍZES de cada estouro). */
function measure() {
  const w = document.documentElement.clientWidth;
  const contained = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox !== 'visible') return true;
    }
    return false;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'contents') return false;
    if (el.closest('[aria-hidden="true"], [inert]')) return false;
    // Fora da tela na vertical (Sheet fechada etc.) não gera rolagem horizontal visível
    return r.bottom > 0 && r.top < window.innerHeight * 4;
  };
  const out = new Set(
    [...document.querySelectorAll('body *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return (r.right > w + 1 || r.left < -1) && visible(e) && !contained(e);
    }),
  );
  const describe = (e) => {
    const r = e.getBoundingClientRect();
    const cls = String(e.getAttribute('class') ?? '').slice(0, 60);
    return `${e.tagName.toLowerCase()}${cls ? '.' + cls.trim().replace(/\s+/g, '.') : ''} left=${Math.round(r.left)} right=${Math.round(r.right)}`;
  };
  const roots = [...out].filter((e) => !out.has(e.parentElement));

  // Rolagem lateral DENTRO de um container (ex.: Sheet com overflow-y: auto, que também vale para x). Só a faixa de
  // chips (.chip-strip) rola de lado de propósito.
  const scrollers = [...document.querySelectorAll('body *')].filter((e) => {
    const ox = getComputedStyle(e).overflowX;
    return (ox === 'auto' || ox === 'scroll') && !e.closest('.chip-strip') && e.scrollWidth > e.clientWidth + 1 && visible(e);
  });

  // Texto cortado: não rola, mas some na borda de um card/Sheet que recorta (overflow hidden/clip), sem reticências.
  const ownText = (e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const clipped = [...document.querySelectorAll('body *')].filter((e) => {
    if (!ownText(e) || !visible(e)) return false;
    const r = e.getBoundingClientRect();
    for (let p = e; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.textOverflow === 'ellipsis') return false;
      if (p === e) continue;
      if (cs.overflowX === 'visible') continue;
      if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') return false; // coberto por "scrollers"
      const pr = p.getBoundingClientRect();
      const margin = 1 + (cs.overflowX === 'clip' ? parseFloat(cs.overflowClipMargin) || 0 : 0);
      return r.right > pr.right + margin || r.left < pr.left - margin;
    }
    return false;
  });

  return {
    scrollers: scrollers.map(describe),
    clipped: clipped.map((e) => `${describe(e)} "${e.textContent.trim().slice(0, 30)}"`),
    clientWidth: w,
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    count: out.size,
    roots: roots.map(describe),
  };
}

before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const report = [];
after(() => {
  if (REPORT) console.log(JSON.stringify(report.filter((r) => r.scrollWidth > r.viewport || r.roots.length || r.scrollers.length || r.clipped.length), null, 1));
});

for (const [userKey, extra] of [['bad', {}], ['hide', {}], ['bad', { text: 1.3 }]]) {
  const label = `${userKey}${extra.text ? ' + texto 130%' : ''}`;
  describe(`sem rolagem horizontal (${label})`, () => {
    for (const vp of extra.text ? VIEWPORTS.filter((v) => v.width !== 360) : VIEWPORTS) {
      for (const scheme of extra.text ? ['light'] : userKey === 'hide' ? ['dark'] : SCHEMES) {
        it(`${vp.width}px ${scheme}`, async () => {
          const ctx = await browser.newContext({
            storageState: await session(userKey),
            viewport: vp,
            isMobile: true,
            hasTouch: true,
            colorScheme: scheme,
            reducedMotion: 'reduce',
          });
          const page = await ctx.newPage();
          const failures = [];
          try {
            for (const s of SCREENS) {
              const path = s.path === 'recipe' ? (recipeId ? `/recipes/${recipeId}` : null) : s.path;
              if (!path) continue;
              await page.goto(`${BASE}${path}`);
              await page.waitForLoadState('networkidle');
              if (path === '/') await page.waitForSelector('.gauge-cluster:not([aria-busy])', { timeout: 30000 });
              if (s.open) {
                await s.open(page);
                await page.waitForSelector('.sheet, [role="dialog"]', { timeout: 10000 });
                await page.waitForTimeout(500);
              }
              if (extra.text) {
                await scaleText(page, extra.text);
                await page.waitForTimeout(100);
              }
              const m = await page.evaluate(measure);
              report.push({ screen: s.name, user: label, viewport: vp.width, scheme, ...m });
              if (m.scrollWidth > vp.width || m.innerWidth > vp.width || m.roots.length || m.scrollers.length || m.clipped.length) {
                failures.push(`${s.name}: scrollWidth=${m.scrollWidth}/${vp.width} ${[...m.roots, ...m.scrollers, ...m.clipped].join(' | ')}`);
              }
            }
          } finally {
            await ctx.close();
          }
          if (!REPORT) assert.deepEqual(failures, []);
        });
      }
    }
  });
}

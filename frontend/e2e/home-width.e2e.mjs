// E2E da largura da Hoje: os cards do dropdown "Refeições" nunca ficam mais largos que o card dos medidores e a
// página não rola de lado. Em 402x874 (iPhone 17), 390x844, 360x800 e 320x700, claro e escuro, dropdown aberto e
// fechado, com dados "ruins": 12 itens, nome de 70 caracteres sem espaço, 12.345 kcal e o selo "estimativa".
// Afirma:
//   - scrollWidth <= largura do aparelho (no Chrome mobile o innerWidth cresce junto com o conteúdo largo);
//   - a borda direita de todo card visível == a do card dos medidores (±1px);
//   - nenhum elemento visível com right > clientWidth + 1 (fora a faixa de chips, que rola de propósito);
//   - cabeçalho em uma linha: "Refeições" à esquerda e "12 itens · 12.345 kcal" (ou "· P … g" sem calorias) à direita;
//   - topo 100% transparente com scrollY = 0 (sem blur, sem máscara) e vidro leve depois de rolar;
//   - textos dos três medidores: duas linhas por coluna, cada uma sem quebrar nem cortar, mesma altura nas três;
//     sem calorias, nenhuma "kcal" no cluster.
//
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3000 node --test e2e/home-width.e2e.mjs
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD ?? 'senha-e2e-bocado';
const LONG = 'Strogonoffdefrangocomarrozbrancobatatapalhacrocanteecreamecheesecaseir'; // 70 caracteres
const VIEWPORTS = [
  { width: 402, height: 874 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 320, height: 700 },
];
const USERS = {
  kcal: { email: 'e2e-home-width@example.test', hideCalories: false, summary: /^12 itens · 12\.345 kcal$/ },
  hide: { email: 'e2e-home-width-hide@example.test', hideCalories: true, summary: /^12 itens · P [\d.]+ g$/ },
};

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

let browser;
const states = {};

async function session(key) {
  if (states[key]) return states[key];
  const user = USERS[key];
  const ctx = await browser.newContext();
  const req = ctx.request;
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email: user.email, password: PASSWORD } });
  if (!res.ok()) {
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: 'Teste Largura', email: user.email, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro: ${res.status()} ${await res.text()}`);
    await req.put(`${BASE}/api/profile`, {
      data: { sex: 'FEMALE', birthDate: '1992-01-10', heightCm: 165, weightKg: 62, activityLevel: 'MODERATE', goal: 'MAINTAIN' },
    });
  }
  await req.patch(`${BASE}/api/profile/preferences`, {
    data: { hideCalories: user.hideCalories, waterEnabled: true, movementEnabled: true, movementDailyGoalMin: 30 },
  });
  const day = await (await req.get(`${BASE}/api/days/${today}`)).json();
  if (day.meals.length === 0) {
    const it = (name, kcal, estimated = false) => ({
      name,
      grams: 100,
      kcal,
      protein: Math.round(Math.min(900, kcal / 20)),
      carbs: Math.round(Math.min(900, kcal / 10)),
      fat: Math.round(Math.min(900, kcal / 40)),
      estimated,
    });
    const post = async (type, items) => {
      const r = await req.post(`${BASE}/api/meals`, { data: { date: today, type, items } });
      assert.ok(r.ok(), `refeição: ${r.status()} ${await r.text()}`);
    };
    // 12 itens, 12.345 kcal no total
    await post('BREAKFAST', [it(LONG, 9000, true), it('Pão francês', 300), it('Café com leite', 250)]);
    await post('LUNCH', [it('Arroz', 400), it('Feijão', 500), it('Frango grelhado', 350), it('Salada', 200)]);
    await post('SNACK', [it('Iogurte', 150), it('Banana', 180)]);
    await post('DINNER', [it('Omelete', 420), it('Torrada', 395, true), it('Chá', 200)]);
  }
  states[key] = await ctx.storageState();
  await ctx.close();
  return states[key];
}

/** No navegador: larguras, bordas dos cards, estouros e o estado do topo. */
function measure() {
  const w = document.documentElement.clientWidth;
  const visible = (e) => {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    if (getComputedStyle(e).visibility === 'hidden') return false;
    return !e.closest('[aria-hidden="true"], [inert]');
  };
  const gauge = document.querySelector('.gauge-card').getBoundingClientRect();
  const cards = [...document.querySelectorAll('.screen .card')]
    .filter(visible)
    .map((e) => ({ name: e.getAttribute('aria-label') ?? e.className, right: e.getBoundingClientRect().right, left: e.getBoundingClientRect().left }));
  const over = new Set(
    [...document.querySelectorAll('body *')].filter((e) => {
      const r = e.getBoundingClientRect();
      return (r.right > w + 1 || r.left < -1) && visible(e) && !e.closest('.chip-strip');
    }),
  );
  const roots = [...over]
    .filter((e) => !over.has(e.parentElement))
    .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).trim().replace(/\s+/g, '.')} right=${Math.round(e.getBoundingClientRect().right)}`);
  const head = document.querySelector('.today-main .collapsible-head');
  const title = head.querySelector('.collapsible-title');
  const summary = head.querySelector('.collapsible-summary');
  const bar = document.querySelector('.top-bar');
  const bs = getComputedStyle(bar);
  return {
    scrollWidth: document.documentElement.scrollWidth,
    gaugeRight: gauge.right,
    gaugeLeft: gauge.left,
    cards,
    roots,
    title: title.textContent,
    summary: summary.textContent,
    headOneLine: head.getBoundingClientRect().height < 56 && Math.abs(title.getBoundingClientRect().top - summary.getBoundingClientRect().top) < 12,
    top: { scrolled: bar.hasAttribute('data-scrolled'), backdrop: bs.backdropFilter, mask: bs.maskImage, bg: bs.backgroundColor },
    gaugeText: [...document.querySelectorAll('.gauge-cluster .gauge-text')].map((t) => ({
      height: Math.round(t.getBoundingClientRect().height),
      lines: [...t.children].map((el) => ({
        text: el.textContent,
        bad: el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).lineHeight) * 1.5 || el.scrollWidth > el.clientWidth + 0.5,
      })),
    })),
    clusterText: document.querySelector('.gauge-cluster').innerText,
  };
}

before(async () => {
  browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
});
after(async () => {
  await browser?.close();
});

for (const key of Object.keys(USERS)) {
  describe(`largura da Hoje (${key === 'hide' ? 'esconder calorias' : 'com calorias'})`, () => {
    for (const vp of VIEWPORTS) {
      for (const scheme of key === 'hide' ? ['dark'] : ['light', 'dark']) {
        it(`${vp.width}x${vp.height} ${scheme}`, async () => {
          const ctx = await browser.newContext({
            storageState: await session(key),
            viewport: vp,
            isMobile: true,
            hasTouch: true,
            colorScheme: scheme,
            reducedMotion: 'reduce',
          });
          const page = await ctx.newPage();
          try {
            await page.goto(`${BASE}/`);
            await page.waitForSelector('.gauge-cluster:not([aria-busy])', { timeout: 30000 });
            await page.waitForLoadState('networkidle');
            const meals = page.getByRole('button', { name: /^Refeições/ });
            // Garante o estado aberto (o aparelho pode lembrar o último)
            if ((await meals.getAttribute('aria-expanded')) === 'false') await meals.click();

            for (const state of ['aberto', 'fechado']) {
              if (state === 'fechado') {
                await meals.click();
                await page.waitForTimeout(400);
                assert.equal(await meals.getAttribute('aria-expanded'), 'false');
              }
              // O clique pode rolar até o botão: o topo é conferido de volta em scrollY = 0
              await page.evaluate(() => window.scrollTo(0, 0));
              await page.waitForFunction(() => !document.querySelector('.top-bar').hasAttribute('data-scrolled'));
              await page.waitForTimeout(250);
              const m = await page.evaluate(measure);
              const where = `${vp.width}px ${scheme} dropdown ${state}`;
              assert.ok(m.scrollWidth <= vp.width, `${where}: scrollWidth ${m.scrollWidth} > ${vp.width}`);
              assert.deepEqual(m.roots, [], `${where}: elementos além da tela`);
              for (const c of m.cards) {
                assert.ok(Math.abs(c.right - m.gaugeRight) <= 1, `${where}: card "${c.name}" termina em ${c.right}, medidores em ${m.gaugeRight}`);
                assert.ok(Math.abs(c.left - m.gaugeLeft) <= 1, `${where}: card "${c.name}" começa em ${c.left}, medidores em ${m.gaugeLeft}`);
              }
              if (state === 'aberto') assert.ok(m.cards.length >= 5, `${where}: cards de refeição visíveis (${m.cards.length})`);
              assert.equal(m.title, 'Refeições');
              assert.match(m.summary, USERS[key].summary);
              assert.ok(m.headOneLine, `${where}: cabeçalho do dropdown em uma linha`);
              if (USERS[key].hideCalories) assert.doesNotMatch(m.summary, /kcal/);
              // Medidores: 3 colunas de 2 linhas, nenhuma quebra/corte, mesma altura
              assert.equal(m.gaugeText.length, 3, `${where}: três blocos de texto`);
              for (const g of m.gaugeText) {
                assert.equal(g.lines.length, 2);
                for (const l of g.lines) assert.ok(!l.bad, `${where}: "${l.text}" quebrou ou foi cortado`);
              }
              assert.equal(new Set(m.gaugeText.map((g) => g.height)).size, 1, `${where}: alturas dos textos ${m.gaugeText.map((g) => g.height)}`);
              if (USERS[key].hideCalories) assert.doesNotMatch(m.clusterText, /kcal/i);
              // Topo: transparente com scrollY = 0
              assert.equal(m.top.scrolled, false, `${where}: topo acendeu sem rolar`);
              assert.equal(m.top.backdrop, 'none');
              assert.equal(m.top.mask, 'none');
              assert.equal(m.top.bg, 'rgba(0, 0, 0, 0)');
            }

            // Depois de rolar mais de 8px, entra o vidro leve
            await meals.click();
            await page.evaluate(() => window.scrollTo(0, 40));
            await page.waitForFunction(() => document.querySelector('.top-bar').hasAttribute('data-scrolled'));
            const glass = await page.evaluate(() => getComputedStyle(document.querySelector('.top-bar')).backdropFilter);
            assert.notEqual(glass, 'none');
          } finally {
            await ctx.close();
          }
        });
      }
    }
  });
}

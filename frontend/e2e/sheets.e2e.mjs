// E2E das folhas (Sheet): a sugestão "Para fechar o dia" abre e FECHA (X, toque fora, Esc, arrastar),
// a página volta a rolar e o foco volta para quem abriu.
//
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3000 npm run test:e2e
// Opcional: E2E_EMAIL / E2E_PASSWORD (senão usa/cria um usuário de teste local) e E2E_CHANNEL=chrome.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL ?? 'e2e-bocado@example.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'senha-e2e-bocado';

const suggestion = (title) => ({
  title,
  items: [
    { name: 'Frango', grams: 150, kcal: 250, protein: 40, carbs: 0, fat: 9, label: '150 g Frango grelhado' },
    { name: 'Arroz', grams: 120, kcal: 150, protein: 3, carbs: 33, fat: 0, label: '4 colheres de arroz' },
  ],
  totals: { kcal: 400, protein: 43, carbs: 33, fat: 9 },
  fit: 0.9,
  good: true,
  origin: 'local',
  mainOrigin: 'history',
  steps: ['Grelhe o frango', 'Sirva com o arroz'],
  minutes: 20,
});

/** Resposta fixa do "Para fechar o dia", com várias ideias (a Sheet fica alta, como no celular de verdade). */
const closeDay = {
  date: '',
  remaining: { kcal: 600, protein: 40, carbs: 60, fat: 15 },
  target: { kcal: 600, protein: 40, carbs: 60, fat: 15 },
  priority: 'protein',
  closed: false,
  suggestions: ['Frango com arroz', 'Omelete', 'Peixe com batata', 'Carne moída'].map(suggestion),
  source: 'local',
  canAskAi: true,
  aiRemaining: 3,
  isPremiumFeature: false,
  pantryChips: ['frango', 'ovo'],
};

let browser;

async function launch() {
  try {
    return await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
  } catch {
    return chromium.launch(); // Chromium do próprio Playwright
  }
}

/** Contexto logado (cria o usuário e o perfil na primeira vez), com o card visível e as sugestões simuladas. */
async function openToday(viewport = { width: 390, height: 844 }) {
  const mobile = viewport.width < 768;
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
  const req = ctx.request;
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  if (!res.ok()) {
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: 'E2E', email: EMAIL, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro do usuário de teste: ${res.status()}`);
    await req.put(`${BASE}/api/profile`, {
      data: { sex: 'FEMALE', birthDate: '1990-05-10', heightCm: 165, weightKg: 62, activityLevel: 'MODERATE', goal: 'MAINTAIN' },
    });
  }
  await ctx.route('**/api/suggestions/close-day?*', (route) => route.fulfill({ json: closeDay }));
  // O card só aparece a partir das 18h e se não foi dispensado
  await ctx.addInitScript(() => {
    Date.prototype.getHours = () => 19;
    for (const k of Object.keys(localStorage)) if (k.includes('dismiss')) localStorage.removeItem(k);
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  return { ctx, page };
}

const sheet = (page) => page.locator('.sheet');
const opener = (page) => page.getByRole('button', { name: /Ver outras ideias/ });

async function openSuggestions(page) {
  await opener(page).click();
  await sheet(page).waitFor();
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', 'scroll do body travado com a folha aberta');
}

async function assertClosedAndScrollable(page) {
  await sheet(page).waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'scroll do body liberado');
  const moved = await page.evaluate(async () => {
    window.scrollTo(0, 0);
    const before = window.scrollY;
    window.scrollBy(0, 300);
    await new Promise((r) => requestAnimationFrame(r));
    return window.scrollY > before;
  });
  assert.ok(moved, 'a página volta a rolar');
}

/** Arraste por toque no topo da folha (pointer events, como no celular). */
async function dragTop(page, dy) {
  await page.evaluate((delta) => {
    const top = document.querySelector('.sheet-top');
    const r = top.getBoundingClientRect();
    const x = r.left + 60;
    const y = r.top + 20;
    const fire = (type, clientY) =>
      top.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: x, clientY, isPrimary: true }));
    fire('pointerdown', y);
    for (let i = 1; i <= 5; i++) fire('pointermove', y + (delta * i) / 5);
    fire('pointerup', y + delta);
  }, dy);
}

before(async () => {
  browser = await launch();
});

after(async () => {
  await browser?.close();
});

describe('Sheet da sugestão "Para fechar o dia"', () => {
  it('fecha pelo X, abre de novo, fecha tocando fora; a página volta a rolar e o foco volta', async () => {
    const { ctx, page } = await openToday();
    try {
      await openSuggestions(page);
      const close = sheet(page).getByRole('button', { name: 'Fechar' });
      const box = await close.boundingBox();
      assert.ok(box.width >= 44 && box.height >= 44, 'X com alvo de 44px');
      await close.click();
      await assertClosedAndScrollable(page);
      assert.match(await page.evaluate(() => document.activeElement?.textContent ?? ''), /Ver outras ideias/, 'foco volta para quem abriu');

      await openSuggestions(page);
      await page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } });
      await assertClosedAndScrollable(page);
    } finally {
      await ctx.close();
    }
  });

  it('fecha com Esc e arrastando o topo para baixo além de 80px (menos que isso, volta)', async () => {
    const { ctx, page } = await openToday();
    try {
      await openSuggestions(page);
      await page.keyboard.press('Escape');
      await assertClosedAndScrollable(page);

      await openSuggestions(page);
      await dragTop(page, 40);
      await page.waitForTimeout(300);
      assert.equal(await sheet(page).count(), 1, 'arraste curto não fecha');
      await dragTop(page, 120);
      await assertClosedAndScrollable(page);
    } finally {
      await ctx.close();
    }
  });

  it('digitar dentro da folha não perde o foco (regressão)', async () => {
    const { ctx, page } = await openToday();
    try {
      await openSuggestions(page);
      await page.locator('#pantry-sheet').click();
      await page.keyboard.type('frango, ovo');
      assert.equal(await page.locator('#pantry-sheet').inputValue(), 'frango, ovo');
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'pantry-sheet');
    } finally {
      await ctx.close();
    }
  });

  it('no desktop também fecha pelo X e pelo Esc', async () => {
    const { ctx, page } = await openToday({ width: 1280, height: 800 });
    try {
      await openSuggestions(page);
      await sheet(page).getByRole('button', { name: 'Fechar' }).click();
      await assertClosedAndScrollable(page);
      await openSuggestions(page);
      await page.keyboard.press('Escape');
      await assertClosedAndScrollable(page);
    } finally {
      await ctx.close();
    }
  });
});

describe('Todas as folhas têm o botão Fechar', () => {
  it('calendário e alimento', async () => {
    const { ctx, page } = await openToday();
    try {
      await page.getByRole('button', { name: 'Escolher dia' }).click();
      await sheet(page).getByRole('button', { name: 'Fechar' }).click();
      await sheet(page).waitFor({ state: 'detached' });

      const row = page.locator('.today-main .list-row').first();
      if (await row.count()) {
        await row.click();
        await sheet(page).getByRole('button', { name: 'Fechar' }).click();
        await sheet(page).waitFor({ state: 'detached' });
      }
    } finally {
      await ctx.close();
    }
  });
});

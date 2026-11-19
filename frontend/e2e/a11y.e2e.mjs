// Auditoria de acessibilidade com axe-core em TODAS as rotas e Sheets, nos temas claro e escuro, em 390x844 e 1280x800.
// Falha com qualquer violação "serious" ou "critical". As "moderate" e "minor" vão para o relatório (A11Y_REPORT) para
// triagem: ver e2e/a11y-moderate.md com a justificativa das que ficam.
//
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3200 node --test e2e/a11y.e2e.mjs
// A11Y_QUICK=1 roda só 390x844 claro. A11Y_ONLY=texto filtra os estados pelo nome. A11Y_REPORT=arquivo.json grava o relatório.
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const PASSWORD = 'senha-e2e-bocado';
const QUICK = !!process.env.A11Y_QUICK;
const ONLY = process.env.A11Y_ONLY?.toLowerCase();
const REPORT = process.env.A11Y_REPORT;

const VIEWPORTS = QUICK ? [{ width: 390, height: 844 }] : [{ width: 390, height: 844 }, { width: 1280, height: 800 }];
const SCHEMES = QUICK ? ['light'] : ['light', 'dark'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = ymd(new Date());
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86_400_000));

let browser;
const states = {};
const moderate = new Map();

async function launch() {
  try {
    return await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
  } catch {
    return chromium.launch();
  }
}

async function user(key, { email, prefs = {}, profile = true, seed }) {
  if (states[key]) return states[key];
  const ctx = await browser.newContext();
  const req = ctx.request;
  await sleep(6500); // login 10/min, cadastro 5/min
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email, password: PASSWORD } });
  let fresh = false;
  if (!res.ok()) {
    fresh = true;
    await sleep(13000);
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: `Pessoa ${key}`, email, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro ${key}: ${res.status()} ${await res.text()}`);
    if (profile) {
      const p = await req.put(`${BASE}/api/profile`, { data: { sex: 'MALE', birthDate: '1988-03-02', heightCm: 180, weightKg: 90, activityLevel: 'MODERATE', goal: 'LOSE' } });
      assert.ok(p.ok(), `perfil ${key}: ${await p.text()}`);
    }
  }
  if (Object.keys(prefs).length) assert.ok((await req.patch(`${BASE}/api/profile/preferences`, { data: prefs })).ok(), `prefs ${key}`);
  if (seed && fresh) await seed(req);
  states[key] = await ctx.storageState();
  await ctx.close();
  return states[key];
}

const meal = (req, date, type, items) => req.post(`${BASE}/api/meals`, { data: { date, type, items } });
const item = (name, kcal, protein, carbs, fat, grams = 100) => ({ name, grams, kcal, protein, carbs, fat });

async function setup() {
  await user('a', {
    email: 'e2e-a11y-a@example.test',
    prefs: { glp1Mode: true, fastingEnabled: true, supplementsEnabled: true, hideCalories: false, waterEnabled: true, movementEnabled: true },
    seed: async (req) => {
      for (let i = 0; i < 6; i++) await meal(req, daysAgo(i), 'LUNCH', [item('Arroz', 500, 10, 90, 5), item('Frango grelhado', 350, 50, 0, 10)]);
      await meal(req, today, 'BREAKFAST', [item('Pão francês', 150, 5, 29, 2, 50)]);
      await req.post(`${BASE}/api/water`, { data: { date: today, amountMl: 400 } });
      await req.post(`${BASE}/api/workouts`, { data: { date: today, type: 'STRENGTH', durationMin: 45, intensity: 'MODERATE', note: '' } });
      for (let i = 0; i < 10; i++) await req.put(`${BASE}/api/weight/${daysAgo(i * 3)}`, { data: { weightKg: 90 - i * 0.3 } });
      await req.post(`${BASE}/api/fasting/start`, { data: { targetHours: 16, startedAt: new Date(Date.now() - 9 * 3_600_000).toISOString() } });
      await req.post(`${BASE}/api/recipes`, { data: { name: 'Receita A11y', servings: 4, ingredients: [{ name: 'Arroz', grams: 300, kcal: 300, protein: 10, carbs: 50, fat: 2 }] } });
    },
  });
  await user('admin', { email: 'e2e-a11y-admin@example.test' });
  await user('new', { email: 'e2e-a11y-new@example.test', profile: false });
  await user('ret', {
    email: 'e2e-a11y-ret@example.test',
    seed: async (req) => {
      const m = await (await meal(req, daysAgo(6), 'BREAKFAST', [item('Ovo', 190, 13, 1, 15)])).json();
      await req.post(`${BASE}/api/favorites`, { data: { fromMealId: m.id, name: 'Meu café' } });
    },
  });
}

/** Desktop (>= 1100 px) não tem TabBar: os registros rápidos ficam na barra lateral. */
const desktop = (page) => (page.viewportSize()?.width ?? 0) >= 1100;
const openQuick = async (page, name) => {
  if (desktop(page)) return page.locator('aside').getByRole('button', { name }).click();
  await openMenu(page);
  return page.getByRole('menuitem', { name }).dispatchEvent('click');
};

const openMenu = async (page) => {
  await page.getByRole('button', { name: 'Adicionar' }).dispatchEvent('click');
  await page.getByRole('menuitem').first().waitFor();
};

/** Cada estado: nome, usuário (null = sem sessão), caminho e, opcionalmente, o que abrir antes de auditar. */
const STATES = [
  { name: 'landing', user: null, path: '/' },
  { name: 'login', user: null, path: '/login' },
  { name: 'cadastro', user: null, path: '/register' },
  { name: 'privacidade', user: null, path: '/privacidade' },
  { name: 'termos', user: null, path: '/termos' },
  { name: 'onboarding', user: 'new', path: '/onboarding' },
  { name: 'hoje', user: 'a', path: '/' },
  { name: 'hoje-secao-fechada', user: 'a', path: '/', open: async (p) => p.getByRole('button', { name: /Refeições/ }).first().click() },
  { name: 'hoje-menu-mais', user: 'a', path: '/', open: async (p) => { if (!desktop(p)) await openMenu(p); } },
  { name: 'hoje-calendario', user: 'a', path: '/', open: (p) => p.getByRole('button', { name: 'Escolher dia' }).click() },
  { name: 'hoje-retorno', user: 'ret', path: '/' },
  { name: 'sheet-agua', user: 'a', path: '/', open: (p) => p.locator('.gauge-cell-water .gauge-btn').click() },
  { name: 'sheet-movimento', user: 'a', path: '/', open: (p) => p.locator('.gauge-cell-move .gauge-btn').click() },
  { name: 'sheet-composicao', user: 'a', path: '/', open: (p) => p.locator('.gauge-cell-center .gauge-btn').click() },
  { name: 'sheet-item', user: 'a', path: '/', open: (p) => p.locator('.list-row', { hasText: 'Pão francês' }).first().dispatchEvent('click') },
  { name: 'sheet-treino', user: 'a', path: '/', open: (p) => openQuick(p, /treino/i) },
  { name: 'sheet-peso', user: 'a', path: '/', open: (p) => openQuick(p, /peso/i) },
  { name: 'sheet-bem-estar', user: 'a', path: '/', open: (p) => p.getByRole('button', { name: /Como você está hoje/ }).click() },
  { name: 'sheet-jejum', user: 'a', path: '/', open: (p) => p.getByRole('button', { name: /Janela de jejum/ }).click() },
  { name: 'add-buscar', user: 'a', path: '/add' },
  { name: 'add-codigo', user: 'a', path: '/add', open: (p) => p.getByRole('button', { name: 'Código' }).click() },
  { name: 'add-foto', user: 'a', path: '/add', open: (p) => p.getByRole('button', { name: 'Foto', exact: true }).click() },
  { name: 'add-descrever', user: 'a', path: '/add', open: (p) => p.getByRole('button', { name: 'Descrever' }).click() },
  { name: 'add-por-quilo', user: 'a', path: '/add', open: (p) => p.getByRole('button', { name: 'Por quilo' }).click() },
  { name: 'add-manual', user: 'a', path: '/add', open: (p) => p.getByRole('button', { name: 'Manual' }).click() },
  { name: 'historico', user: 'a', path: '/history' },
  { name: 'receitas', user: 'a', path: '/recipes' },
  { name: 'receitas-lista-compras', user: 'a', path: '/recipes', open: (p) => p.getByRole('button', { name: 'Lista de compras' }).click() },
  { name: 'receita-editor', user: 'a', path: '/recipes/new' },
  { name: 'perfil', user: 'a', path: '/profile' },
  { name: 'perfil-importar', user: 'a', path: '/profile', open: async (p) => { await p.getByRole('button', { name: 'Importar histórico' }).click(); } },
  { name: 'perfil-atalhos-teclado', user: 'a', path: '/profile', open: (p) => p.getByRole('button', { name: 'Atalhos de teclado' }).click() },
  { name: 'perfil-registrar-peso', user: 'a', path: '/profile', open: (p) => p.locator('#conteudo').getByRole('button', { name: 'Registrar peso' }).click() },
  { name: 'suplementos', user: 'a', path: '/supplements' },
  { name: 'admin', user: 'admin', path: '/admin' },
  { name: 'rapido-agua', user: 'a', path: '/rapido/agua?ml=200' },
  { name: 'rapido-agua-alterar', user: 'a', path: '/rapido/agua?ml=999999', },
  { name: 'rapido-treino', user: 'a', path: '/rapido/treino?tipo=corrida&min=45&int=forte' },
  { name: 'rapido-peso', user: 'a', path: '/rapido/peso' },
  { name: 'rapido-jejum', user: 'a', path: '/rapido/jejum' },
];

async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(400);
}

function summarize(violations) {
  return violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) ex.: ${v.nodes[0]?.target?.join(' ')}`);
}

before(
  async () => {
    browser = await launch();
    await setup();
  },
  { timeout: 600_000 },
);
after(async () => {
  if (REPORT) writeFileSync(REPORT, JSON.stringify([...moderate.entries()].map(([k, v]) => ({ rule: k, ...v })), null, 2));
  await browser?.close();
});

describe('axe: sem violações sérias ou críticas', () => {
  for (const st of STATES) {
    if (ONLY && !st.name.includes(ONLY)) continue;
    it(st.name, { timeout: 240_000 }, async () => {
      for (const scheme of SCHEMES) {
        for (const vp of VIEWPORTS) {
          const ctx = await browser.newContext({
            viewport: vp,
            colorScheme: scheme,
            locale: 'pt-BR',
            timezoneId: 'America/Sao_Paulo',
            ...(st.user ? { storageState: states[st.user] } : {}),
          });
          const page = await ctx.newPage();
          try {
            await page.goto(`${BASE}${st.path}`);
            await settle(page);
            if (st.open) {
              await st.open(page);
              await settle(page);
            }
            const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
            const hard = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
            for (const v of results.violations.filter((v) => !hard.includes(v))) {
              const key = v.id;
              const cur = moderate.get(key) ?? { impact: v.impact, help: v.help, where: [] };
              cur.where.push(`${st.name} ${vp.width} ${scheme}: ${v.nodes[0]?.target?.join(' ')}`);
              moderate.set(key, cur);
            }
            assert.deepEqual(summarize(hard), [], `${st.name} (${vp.width}x${vp.height}, ${scheme})`);
          } finally {
            await ctx.close();
          }
        }
      }
    });
  }
});

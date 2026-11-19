// Texto ampliado em 200% (e alto contraste): nada sobreposto nem cortado e sem rolagem horizontal.
// Simula o texto grande do sistema escalando a fonte raiz (a tipografia do app é em rem), em 390x844 e 360x800.
// Uso: E2E_BASE_URL=http://localhost:3200 node --test e2e/zoom.e2e.mjs
// ZOOM_SHOTS=/pasta grava um PNG por tela. ZOOM_ONLY=texto filtra pelo nome.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const PASSWORD = 'senha-e2e-bocado';
const SHOTS = process.env.ZOOM_SHOTS;
const ONLY = process.env.ZOOM_ONLY?.toLowerCase();
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [{ width: 390, height: 844 }, { width: 360, height: 800 }];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let browser;
let state;

const SCREENS = [
  { name: 'hoje', path: '/' },
  { name: 'nova-refeicao', path: '/add' },
  { name: 'nova-refeicao-por-quilo', path: '/add', open: (p) => p.getByRole('button', { name: 'Por quilo' }).click() },
  { name: 'historico', path: '/history' },
  { name: 'receitas', path: '/recipes' },
  { name: 'perfil', path: '/profile' },
  { name: 'sheet-agua', path: '/', open: (p) => p.locator('.gauge-cell-water .gauge-btn').click() },
  { name: 'sheet-peso', path: '/profile', open: (p) => p.getByRole('button', { name: 'Registrar peso' }).click() },
  { name: 'rapido-agua', path: '/rapido/agua?ml=200' },
  { name: 'rapido-treino', path: '/rapido/treino?min=9999' },
];

/** No navegador: rolagem horizontal, texto cortado e botões sobrepostos. */
function audit() {
  const problems = [];
  const w = window.innerWidth;
  if (document.documentElement.scrollWidth > w + 1) problems.push(`rolagem horizontal: ${document.documentElement.scrollWidth} > ${w}`);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('[aria-hidden="true"], [inert], .sr-only');
  };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

  // Texto cortado: elemento com texto que sai do ancestral que recorta (overflow hidden/clip) sem reticências
  for (const el of document.querySelectorAll('body *')) {
    if (!ownText(el) || !visible(el)) continue;
    const r = el.getBoundingClientRect();
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.textOverflow === 'ellipsis') break;
      if (p === el) continue;
      if (cs.overflowX !== 'visible' && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') {
        const pr = p.getBoundingClientRect();
        if (r.right > pr.right + 2 || r.left < pr.left - 2) {
          problems.push(`texto cortado em <${p.tagName.toLowerCase()} class="${String(p.className).slice(0, 30)}">: "${el.textContent.trim().slice(0, 30)}"`);
          break;
        }
      }
    }
  }
  // Recorte por altura fixa: o conteúdo é mais alto que a caixa que recorta
  for (const el of document.querySelectorAll('button, a, h1, h2, h3, label, .gauge-text, .gauge-label, .gauge-value')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 2 && ownText(el)) {
      problems.push(`texto cortado na altura em <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 30)}">: "${el.textContent.trim().slice(0, 30)}"`);
    }
    if (cs.overflowX === 'hidden' && cs.textOverflow !== 'ellipsis' && el.scrollWidth > el.clientWidth + 2 && ownText(el)) {
      problems.push(`texto cortado na largura em <${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 30)}">: "${el.textContent.trim().slice(0, 30)}"`);
    }
  }
  // Alvos sobrepostos (botões e links que não estão um dentro do outro)
  // Com uma folha aberta, só o que está nela conta (a página atrás fica coberta de propósito)
  const dialog = document.querySelector('[aria-modal="true"]');
  const targets = [...document.querySelectorAll('button, a[href], input, select, textarea, summary')].filter(
    (e) => visible(e) && !e.closest('.tabbar, .sheet-scrim, .toast-region') && (!dialog || dialog.contains(e)),
  );
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i];
      const b = targets[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ix = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const iy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ix > 4 && iy > 4) {
        const area = ix * iy;
        if (area > 0.25 * Math.min(ra.width * ra.height, rb.width * rb.height)) {
          problems.push(`sobreposição: "${(a.textContent || a.getAttribute('aria-label') || a.tagName).trim().slice(0, 20)}" e "${(b.textContent || b.getAttribute('aria-label') || b.tagName).trim().slice(0, 20)}"`);
          if (problems.length > 12) return problems;
        }
      }
    }
  }
  return problems;
}

before(
  async () => {
    try {
      browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
    } catch {
      browser = await chromium.launch();
    }
    const ctx = await browser.newContext();
    await sleep(6500);
    const res = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: 'e2e-a11y-a@example.test', password: PASSWORD } });
    assert.ok(res.ok(), 'rode antes e2e/a11y.e2e.mjs: ele cria as contas de teste');
    state = await ctx.storageState();
    await ctx.close();
  },
  { timeout: 120_000 },
);
after(async () => browser?.close());

for (const mode of ['texto 200%', 'texto 200% + alto contraste']) {
  describe(mode, () => {
    for (const sc of SCREENS) {
      if (ONLY && !sc.name.includes(ONLY)) continue;
      it(sc.name, { timeout: 120_000 }, async () => {
        for (const vp of VIEWPORTS) {
          const ctx = await browser.newContext({ viewport: vp, storageState: state, locale: 'pt-BR', colorScheme: mode.includes('contraste') ? 'dark' : 'light' });
          if (mode.includes('contraste')) {
            await ctx.addInitScript(() => localStorage.setItem('bocado:a11y', JSON.stringify({ c: true, t: true, m: true })));
          }
          const page = await ctx.newPage();
          try {
            await page.goto(`${BASE}${sc.path}`);
            await page.waitForLoadState('networkidle').catch(() => undefined);
            await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
            await page.waitForTimeout(500);
            if (sc.open) {
              await sc.open(page);
              await page.waitForTimeout(500);
            }
            const problems = await page.evaluate(audit);
            if (SHOTS) await page.screenshot({ path: `${SHOTS}/${sc.name}-${vp.width}-${mode.includes('contraste') ? 'hc' : 'zoom'}.png` });
            assert.deepEqual(problems, [], `${sc.name} (${vp.width}x${vp.height})`);
          } finally {
            await ctx.close();
          }
        }
      });
    }
  });
}

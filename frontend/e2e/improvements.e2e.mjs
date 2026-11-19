// Validação visual das melhorias (importar peso, atalhos, acessibilidade) em 402x874, 390x844, 360x800 e 1280x800, claro e escuro.
// Afirma, em cada tela: sem rolagem horizontal, nada atrás da TabBar, títulos em uma linha, sem palavras de culpa nem
// vermelho de julgamento. Também confirma que ABRIR /rapido/* nunca registra nada (nenhum POST/PUT/PATCH/DELETE).
// Uso: E2E_BASE_URL=http://localhost:3200 node --test e2e/improvements.e2e.mjs   (SHOTS_DIR=/pasta grava PNGs; E2E_QUICK=1 só 390 claro)
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const PASSWORD = 'senha-e2e-bocado';
const SHOTS = process.env.SHOTS_DIR;
const QUICK = !!process.env.E2E_QUICK;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const VIEWPORTS = QUICK ? [{ width: 390, height: 844 }] : [{ width: 402, height: 874 }, { width: 390, height: 844 }, { width: 360, height: 800 }, { width: 1280, height: 800 }];
const SCHEMES = QUICK ? ['light'] : ['light', 'dark'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CSV = 'Data;Peso (kg)\r\n' + Array.from({ length: 40 }, (_, i) => `${String(1 + (i % 28)).padStart(2, '0')}/${i < 28 ? '09' : '10'}/2025;${(88 - i * 0.12).toFixed(1).replace('.', ',')}`).join('\r\n') + '\r\n06/09/2025;99,0\r\n';

let browser;
let state;

/** No navegador: tudo que o app não deve fazer, em uma passada. */
function audit() {
  const w = document.documentElement.clientWidth;
  const problems = [];
  if (document.documentElement.scrollWidth > window.innerWidth) problems.push(`rolagem horizontal: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.display !== 'contents';
  };
  const contained = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll('body *')) {
    const r = e.getBoundingClientRect();
    if ((r.right > w + 1 || r.left < -1) && visible(e) && !contained(e) && !e.closest('[aria-hidden="true"], [inert]')) {
      problems.push(`além da largura: <${e.tagName.toLowerCase()} class="${String(e.className).slice(0, 50)}"> ${Math.round(r.left)}..${Math.round(r.right)}`);
      break;
    }
  }

  // Títulos em uma linha (h1 do app e h2.title das Sheets)
  for (const h of document.querySelectorAll('h1, h2.title')) {
    if (!visible(h)) continue;
    const rg = document.createRange();
    rg.selectNodeContents(h);
    const lines = new Set([...rg.getClientRects()].map((r) => Math.round(r.top)));
    if (lines.size > 1) problems.push(`título em mais de uma linha: "${h.textContent.trim().slice(0, 50)}"`);
  }

  // Nada atrás da TabBar: o último conteúdo da página (rolada até o fim) termina acima dela
  const tab = document.querySelector('.tabbar-pill');
  if (tab && getComputedStyle(document.querySelector('.tabbar')).display !== 'none' && !document.querySelector('[aria-modal="true"]')) {
    const top = tab.getBoundingClientRect().top;
    const main = document.querySelector('main');
    const kids = [...(main?.querySelectorAll('*') ?? [])].filter((e) => visible(e) && !e.closest('.tabbar'));
    const lowest = Math.max(0, ...kids.map((e) => e.getBoundingClientRect().bottom));
    if (lowest > top + 1) problems.push(`conteúdo atrás da TabBar: ${Math.round(lowest)} > ${Math.round(top)}`);
  }

  // Palavras de culpa (texto visível)
  const text = document.body.innerText;
  const banned = text.match(/falhou|quebrou|esqueceu|compensar|compense|sequência|streak|você perdeu|culpa/i);
  if (banned) problems.push(`palavra de culpa: "${banned[0]}"`);

  // Vermelho de julgamento: nada visível na cor de erro (#e5384a / #ff5a68) fora de um alerta técnico
  const danger = getComputedStyle(document.documentElement).getPropertyValue('--danger').trim();
  const probe = document.createElement('i');
  probe.style.color = danger;
  document.body.appendChild(probe);
  const dangerRgb = getComputedStyle(probe).color;
  probe.remove();
  for (const e of document.querySelectorAll('body *')) {
    if (!visible(e) || e.closest('.alert, .toast-error, .btn-danger, .danger-zone')) continue;
    const cs = getComputedStyle(e);
    const own = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if ((own && cs.color === dangerRgb) || cs.backgroundColor === dangerRgb || cs.borderTopColor === dangerRgb) {
      problems.push(`cor de erro em <${e.tagName.toLowerCase()} class="${String(e.className).slice(0, 40)}">`);
      break;
    }
  }
  return problems;
}


async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(350);
}

async function check(name, path, prep, { init, focus, scroll = true } = {}) {
  for (const scheme of SCHEMES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme, storageState: state, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', deviceScaleFactor: 2, hasTouch: vp.width < 1000 });
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}${path}`);
        await settle(page);
        if (prep) await prep(page);
        await settle(page);
        if (scroll) await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(150);
        const problems = await page.evaluate(audit);
        if (SHOTS) {
          if (focus) await page.locator(focus).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
          else await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(100);
          await page.screenshot({ path: `${SHOTS}/${name}-${vp.width}-${scheme}.png` });
        }
        assert.deepEqual(problems, [], `${name} (${vp.width}x${vp.height}, ${scheme}): ${problems.join(' | ')}`);
      } finally {
        await ctx.close();
      }
    }
  }
}

const HC = () => localStorage.setItem('bocado:a11y', JSON.stringify({ c: true, t: true, m: true }));
const BIG = (page) => page.addStyleTag({ content: 'html { font-size: 150% !important; }' });

before(
  async () => {
    browser = await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' }).catch(() => chromium.launch());
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

describe('Importar histórico de peso', () => {
  it('prévia do CSV (período, médias, descartados, saltos e conflito)', async () => {
    await check('importar-previa', '/profile', async (page) => {
      await page.getByRole('button', { name: 'Importar histórico' }).click();
      await page.getByLabel('Escolher arquivo').or(page.locator('input[type=file]')).first().setInputFiles({ name: 'peso.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
      await page.getByText('dias com peso').waitFor();
      await page.getByText('Manter os meus').waitFor();
      await page.getByText('Se já houver peso no mesmo dia').waitFor();
    }, { scroll: false });
  });
});

describe('Atalhos', () => {
  it('abrir /rapido/agua mostra o cartão e NÃO registra nada; só o botão registra', async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state, locale: 'pt-BR' });
    const page = await ctx.newPage();
    const writes = [];
    page.on('request', (r) => {
      if (r.url().includes('/api/') && r.method() !== 'GET') writes.push(`${r.method()} ${new URL(r.url()).pathname}`);
    });
    for (const path of ['/rapido/agua?ml=200', '/rapido/treino?tipo=corrida&min=45&int=forte', '/rapido/peso', '/rapido/jejum?h=16', '/rapido/refeicao?modo=busca']) {
      await page.goto(`${BASE}${path}`);
      await settle(page);
    }
    assert.deepEqual(writes, [], 'abrir uma URL de atalho nunca muda dados');
    await page.goto(`${BASE}/rapido/agua?ml=250`);
    await settle(page);
    await page.getByText('Registrar 250 ml de água?').waitFor();
    assert.equal(await page.getByRole('button', { name: 'Registrar' }).evaluate((el) => document.activeElement === el), true, 'foco inicial em Registrar');
    await page.keyboard.press('Enter');
    await page.waitForURL((u) => u.pathname === '/');
    assert.ok(writes.some((w) => w === 'POST /api/water'), 'o POST só acontece ao confirmar');
    await ctx.close();
  });

  it('cartão de confirmação da água', async () => {
    await check('rapido-agua', '/rapido/agua?ml=200', (page) => page.getByText('Registrar 200 ml de água?').waitFor(), { scroll: false });
  });
  it('cartão com valor inválido mostra os campos editáveis (sem erro técnico)', async () => {
    await check('rapido-agua-invalido', '/rapido/agua?ml=999999', (page) => page.getByLabel('Quantidade (ml)').waitFor(), { scroll: false });
  });
  it('Perfil > Atalhos', async () => {
    await check('perfil-atalhos', '/profile', (page) => page.getByText('Links dos atalhos').or(page.getByRole('list', { name: 'Links dos atalhos' })).first().waitFor(), { focus: '#atalhos' });
  });
});

describe('Acessibilidade: telas principais em alto contraste e com texto ampliado', () => {
  for (const [name, path] of [['hoje', '/'], ['nova-refeicao', '/add'], ['historico', '/history'], ['receitas', '/recipes'], ['perfil', '/profile']]) {
    it(`${name} em alto contraste`, async () => {
      await check(`${name}-alto-contraste`, path, undefined, { init: HC });
    });
    it(`${name} com texto ampliado (150%)`, async () => {
      await check(`${name}-texto-150`, path, async (page) => BIG(page));
    });
  }
  it('Perfil > Acessibilidade', async () => {
    await check('perfil-acessibilidade', '/profile', (page) => page.getByText('Alto contraste').first().waitFor(), { focus: '#acessibilidade' });
  });
});

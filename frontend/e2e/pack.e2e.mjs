// E2E do pacote de diferenciais: voz, prato por quilo, modo GLP-1, jejum, acervo verificado, retorno sem culpa e lista de compras.
// Em 402x874, 390x844 e 360x800, claro e escuro, afirma em cada tela:
//   - sem rolagem horizontal (e nenhum elemento além da largura);
//   - nada de conteúdo atrás da TabBar (com a página rolada até o fim);
//   - títulos (h1 e h2 de Sheet) em uma linha;
//   - nenhuma palavra de culpa e nenhum vermelho de julgamento (só o vermelho de erro técnico, que não deve aparecer).
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3200 node --test e2e/pack.e2e.mjs
// SHOTS_DIR=/caminho grava um PNG por tela/viewport/tema. E2E_QUICK=1 roda só 390 claro.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3200';
const PASSWORD = 'senha-e2e-bocado';
const SHOTS = process.env.SHOTS_DIR;
const QUICK = !!process.env.E2E_QUICK;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = QUICK ? [{ width: 390, height: 844 }] : [{ width: 402, height: 874 }, { width: 390, height: 844 }, { width: 360, height: 800 }];
const SCHEMES = QUICK ? ['light'] : ['light', 'dark'];

const BANNED = /falhou|quebrou|esqueceu|compensar|compense|sequência|streak|você perdeu|culpa/i;

const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => ymd(new Date(Date.now() - n * 86_400_000));
const today = daysAgo(0);

// PNG 1x1 válido (a compressão da foto precisa decodificar uma imagem)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser;
const states = {};

async function launch() {
  try {
    return await chromium.launch({ channel: process.env.E2E_CHANNEL ?? 'chrome' });
  } catch {
    return chromium.launch();
  }
}

/** Cria (ou entra com) um usuário, aplica o perfil e as preferências, e guarda a sessão. */
async function user(key, { email, prefs = {}, birthDate = '1988-03-02', seed }) {
  if (states[key]) return states[key];
  const ctx = await browser.newContext();
  const req = ctx.request;
  // As rotas de autenticação têm limite por minuto (login 10, cadastro 5): espaça as chamadas
  await sleep(6500);
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email, password: PASSWORD } });
  let fresh = false;
  if (!res.ok()) {
    fresh = true;
    await sleep(13000);
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: `Pessoa ${key}`, email, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro ${key}: ${res.status()} ${await res.text()}`);
    const p = await req.put(`${BASE}/api/profile`, {
      data: { sex: 'MALE', birthDate, heightCm: 180, weightKg: 90, activityLevel: 'MODERATE', goal: 'LOSE' },
    });
    assert.ok(p.ok(), `perfil ${key}: ${await p.text()}`);
  }
  if (Object.keys(prefs).length) {
    const r = await req.patch(`${BASE}/api/profile/preferences`, { data: prefs });
    assert.ok(r.ok(), `preferências ${key}: ${r.status()} ${await r.text()}`);
  }
  if (seed && fresh) await seed(req); // só na criação: rodar de novo não duplica os dados
  states[key] = await ctx.storageState();
  await ctx.close();
  return states[key];
}

const meal = (req, date, type, items) => req.post(`${BASE}/api/meals`, { data: { date, type, items } });
const item = (name, kcal, protein, carbs, fat, grams = 100) => ({ name, grams, kcal, protein, carbs, fat });

const PRODUCT = { name: 'Barra proteica E2E Verificada', brand: 'Marca Teste', per100: { kcal: 380, protein: 30, carbs: 40, fat: 10 }, serving: { grams: 45, label: '1 barra (45 g)' } };

async function setupAll() {
  // Pessoa A: GLP-1 + jejum ativo + 5 dias de ingestão baixa (dispara o aviso de segurança), hoje com uma refeição
  await user('a', {
    email: 'e2e-pack-a@example.test',
    prefs: { glp1Mode: true, fastingEnabled: true, hideCalories: false, waterEnabled: true, movementEnabled: true },
    seed: async (req) => {
      for (let i = 0; i < 5; i++) await meal(req, daysAgo(i), 'LUNCH', [item('Arroz', 500, 10, 90, 5), item('Frango grelhado', 350, 50, 0, 10)]);
      await req.post(`${BASE}/api/water`, { data: { date: today, amountMl: 300 } });
      await req.post(`${BASE}/api/fasting/start`, { data: { targetHours: 16, startedAt: new Date(Date.now() - (11 * 60 + 20) * 60_000).toISOString() } });
      for (const [name, grams] of [['Arroz', 300], ['Feijão', 200]]) {
        await req.post(`${BASE}/api/recipes`, {
          data: { name: `Receita E2E ${name}`, servings: 4, ingredients: [{ name, grams, kcal: 300, protein: 10, carbs: 50, fat: 2 }, { name: 'Cebola', grams: 55, kcal: 20, protein: 1, carbs: 4, fat: 0 }] },
        });
      }
    },
  });
  // Pessoa B: voltou depois de 5 dias (card de retorno), com um favorito para repetir
  await user('b', {
    email: 'e2e-pack-b@example.test',
    prefs: { hideCalories: false },
    seed: async (req) => {
      const m = await (await meal(req, daysAgo(5), 'BREAKFAST', [item('Pão francês', 150, 5, 29, 2, 50), item('Ovo mexido', 190, 13, 1, 15)])).json();
      await req.post(`${BASE}/api/favorites`, { data: { fromMealId: m.id, name: 'Meu café de sempre' } });
    },
  });
  // Produto do acervo: criado por C e confirmado por D e E (2 pessoas diferentes) = "Verificado"
  const c = await user('c', { email: 'e2e-pack-c@example.test' });
  const cctx = await browser.newContext({ storageState: c });
  let product = await (await cctx.request.get(`${BASE}/api/foods/search?q=${encodeURIComponent('barra proteica e2e')}`)).json();
  product = product.find((f) => f.name === PRODUCT.name);
  if (!product) {
    const r = await cctx.request.post(`${BASE}/api/foods/products`, { data: PRODUCT });
    assert.ok(r.ok(), `produto: ${r.status()} ${await r.text()}`);
    product = await r.json();
  }
  await cctx.close();
  for (const k of ['d', 'e']) {
    const st = await user(k, { email: `e2e-pack-${k}@example.test` });
    const ctx = await browser.newContext({ storageState: st });
    await ctx.request.post(`${BASE}/api/foods/${product.id}/confirm`);
    await ctx.close();
  }
  // Admin: dois produtos parecidos para o "Acervo"
  await user('admin', {
    email: 'e2e-pack-admin@example.test',
    seed: async (req) => {
      for (const n of ['Granola E2E Duplicada', 'Granola E2E Duplicada']) {
        await req.post(`${BASE}/api/foods/products`, { data: { name: n, brand: 'Marca Dup', per100: { kcal: 400, protein: 8, carbs: 70, fat: 9 } } });
      }
    },
  });
  // Segundo produto parecido, direto pelo banco não há; o endpoint recusa nome igual só pelo código. Como não há código, entram os dois.
}

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

/** Roda uma tela em todos os viewports/temas, audita e (opcional) fotografa. `prep` leva a tela ao estado desejado. */
async function check(name, userKey, path, prep, { init, expectAudit = true, focus } = {}) {
  for (const scheme of SCHEMES) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: vp,
        colorScheme: scheme,
        storageState: states[userKey],
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        deviceScaleFactor: 2,
        hasTouch: true,
      });
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      try {
        await page.goto(`${BASE}${path}`);
        await settle(page);
        if (prep) await prep(page);
        await settle(page);
        // Rolar até o fim: a auditoria da TabBar olha o último conteúdo
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(150);
        const problems = expectAudit ? await page.evaluate(audit) : [];
        if (SHOTS) {
          if (focus) await page.locator(focus).first().evaluate((el) => el.scrollIntoView({ block: 'center' }));
          else await page.evaluate(() => window.scrollTo(0, 0));
          await page.waitForTimeout(100);
          await page.screenshot({ path: `${SHOTS}/${name.replace(/[^\w-]+/g, '_')}-${vp.width}-${scheme}.png`, fullPage: false });
        }
        assert.deepEqual(problems, [], `${name} (${vp.width}x${vp.height}, ${scheme}): ${problems.join(' | ')}`);
      } finally {
        await ctx.close();
      }
    }
  }
}

// Reconhecimento de voz simulado: fala "dois ovos mexidos" e fica ouvindo
const FAKE_SPEECH = () => {
  class Fake {
    start() {
      setTimeout(() => this.onstart?.(), 10);
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'dois ovos mexidos e café' }], { isFinal: false })] }), 40);
    }
    stop() {
      setTimeout(() => this.onend?.(), 10);
    }
  }
  window.SpeechRecognition = Fake;
  window.webkitSpeechRecognition = Fake;
};
const NO_SPEECH = () => {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
};

before(
  async () => {
    browser = await launch();
    await setupAll();
  },
  { timeout: 600_000 },
);
after(async () => {
  await browser?.close();
});

describe('Etapa 1: voz', () => {
  it('Nova refeição / Descrever: microfone ouvindo, texto parcial, campo editável (sem analisar sozinho)', async () => {
    await check('voz-descrever', 'a', '/add', async (page) => {
      await page.getByRole('button', { name: 'Descrever' }).click();
      const mic = page.getByRole('button', { name: /Falar a refeição/ });
      assert.equal(await mic.getAttribute('aria-pressed'), 'false');
      assert.ok((await mic.boundingBox()).width >= 44 && (await mic.boundingBox()).height >= 44, 'alvo >= 44 px');
      await mic.click();
      await page.getByText('dois ovos mexidos e café').waitFor();
      assert.equal(await page.getByRole('button', { name: 'Parar de ouvir' }).getAttribute('aria-pressed'), 'true');
      await page.getByRole('button', { name: 'Parar de ouvir' }).click();
      await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('dois ovos mexidos e café'));
      // A transcrição só preenche o campo: nenhuma análise foi disparada
      assert.equal(await page.getByRole('button', { name: /Estimando/ }).count(), 0);
    }, { init: FAKE_SPEECH });
  });

  it('busca de alimentos: a fala vira o termo da busca', async () => {
    await check('voz-busca', 'a', '/add', async (page) => {
      await page.getByRole('button', { name: 'Buscar falando' }).click();
      await page.getByText('dois ovos mexidos e café').waitFor();
      await page.getByRole('button', { name: 'Parar de ouvir' }).click();
      await page.waitForFunction(() => document.querySelector('input[type="search"]')?.value === 'dois ovos mexidos e café');
    }, { init: FAKE_SPEECH });
  });

  it('menu "+": "Falar refeição" abre em Descrever já ouvindo', async () => {
    await check('voz-menu', 'a', '/', async (page) => {
      await page.getByRole('button', { name: 'Adicionar' }).dispatchEvent('click');
      await page.getByRole('menuitem', { name: /Falar refeição/ }).waitFor();
      await page.getByRole('menuitem', { name: /Falar refeição/ }).dispatchEvent('click');
      await page.waitForURL(/\/add.*voice=1/);
      await page.getByText('dois ovos mexidos e café').waitFor();
    }, { init: FAKE_SPEECH });
  });

  it('sem suporte do navegador: nenhum botão de microfone, nem o item do menu', async () => {
    const ctx = await browser.newContext({ viewport: VIEWPORTS[0], storageState: states.a });
    await ctx.addInitScript(NO_SPEECH);
    const page = await ctx.newPage();
    await page.goto(`${BASE}/add`);
    await settle(page);
    assert.equal(await page.locator('.mic-btn').count(), 0, 'busca');
    await page.getByRole('button', { name: 'Descrever' }).click();
    assert.equal(await page.locator('.mic-btn').count(), 0, 'descrever');
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.getByRole('button', { name: 'Adicionar' }).dispatchEvent('click');
    assert.equal(await page.getByRole('menuitem', { name: /Falar refeição/ }).count(), 0, 'menu');
    await ctx.close();
  });
});

describe('Etapa 2: prato por quilo', () => {
  it('modo Por quilo: peso grande, resultado soma o total, conferência com a balança e favorita', async () => {
    const result = {
      title: 'Prato por quilo',
      notes: null,
      hasCookedFood: false,
      preparationFat: { level: 'none', kind: 'unknown', reason: '' },
      totalGrams: 520,
      items: [
        { name: 'Arroz branco', grams: 210, kcal: 270, protein: 5, carbs: 59, fat: 0.5, confidence: 'medium', estimated: true },
        { name: 'Feijão carioca', grams: 150, kcal: 115, protein: 7, carbs: 20, fat: 0.8, confidence: 'medium', estimated: true },
        { name: 'Frango grelhado', grams: 160, kcal: 260, protein: 49, carbs: 0, fat: 5.6, confidence: 'medium', estimated: true },
      ],
      totals: { kcal: 645, protein: 61, carbs: 79, fat: 6.9 },
    };
    await check('por-quilo', 'a', '/add', async (page) => {
      await page.route('**/api/analysis/photo', async (route) => {
        const body = route.request().postData() ?? '';
        assert.match(body, /by_weight/);
        assert.match(body, /520/);
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      });
      await page.getByRole('button', { name: 'Por quilo' }).click();
      await page.getByLabel('Peso do prato (g)').fill('520');
      await page.getByLabel('Escolher foto da refeição').setInputFiles({ name: 'prato.png', mimeType: 'image/png', buffer: PNG });
      await page.getByRole('button', { name: 'Analisar', exact: true }).click();
      await page.getByText('Total: 520 g, igual à balança').waitFor();
      // Editar uma gramatura: mostra a diferença, sem bloquear
      await page.getByLabel('Porção em gramas').first().fill('230');
      await page.getByText('Agora 540 g de 520 g').waitFor();
      await page.getByText('Salvar como favorita para repetir depois').click();
      assert.equal(await page.getByPlaceholder('Almoço no restaurante X').inputValue(), 'Almoço no restaurante ');
    }, { focus: '.weighed-line' });
  });
});

describe('Etapas 3 e 4: modo GLP-1 e jejum', () => {
  it('Home com GLP-1: proteína no centro, piso na linha de macros, bem-estar, jejum e o aviso neutro', async () => {
    await check('home-glp1', 'a', '/', async (page) => {
      await page.getByText(/Proteína · (faltam|piso)/).first().waitFor();
      await page.getByText('Como você está hoje?').waitFor();
      await page.getByText(/Janela de jejum · 11h\d\d de 16h/).waitFor();
      await page.getByText('Sua ingestão tem ficado bem baixa nos últimos dias. Vale conversar com seu médico ou nutricionista.').waitFor();
      assert.equal(await page.getByText('Proteína · piso').count() > 0, true, 'piso na linha de macros');
    });
  });

  it('Sheet de bem-estar: 4 escalas, nota e salvar', async () => {
    await check('sheet-bem-estar', 'a', '/', async (page) => {
      await page.getByRole('button', { name: /Como você está hoje/ }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('group', { name: 'Náusea' }).getByRole('button', { name: 'Leve' }).click();
      await dialog.getByRole('group', { name: 'Intestino' }).getByRole('button', { name: 'Tranquilo' }).click();
      await dialog.getByRole('group', { name: 'Apetite' }).waitFor();
      await dialog.getByRole('group', { name: 'Energia' }).waitFor();
    });
  });

  it('jejum ativo: Sheet com encerrar e editar horário', async () => {
    await check('sheet-jejum', 'a', '/', async (page) => {
      await page.getByRole('button', { name: /Janela de jejum/ }).click();
      await page.getByRole('button', { name: 'Encerrar agora' }).waitFor();
      await page.getByText('Editar o horário').click();
    });
  });

  it('menu "+": Jejum e Falar refeição', async () => {
    await check('menu-mais', 'a', '/', async (page) => {
      await page.getByRole('button', { name: 'Adicionar' }).dispatchEvent('click');
      await page.getByRole('menuitem', { name: /Jejum/ }).waitFor();
    }, { init: FAKE_SPEECH });
  });

  it('Perfil: Uso de GLP-1 (piso de proteína, adaptativa pausada) e Jejum intermitente', async () => {
    await check('perfil-glp1', 'a', '/profile', async (page) => {
      await page.getByText('Uso de GLP-1').waitFor();
      await page.getByText('Piso de proteína (g por dia)').scrollIntoViewIfNeeded();
      await page.getByText('Jejum intermitente').first().waitFor();
    }, { focus: '#glp1' });
  });
});

describe('Etapa 5: acervo verificado', () => {
  it('busca com o selo Verificado e botão de confirmar na Sheet', async () => {
    await check('acervo-verificado', 'b', '/add', async (page) => {
      await page.getByPlaceholder(/Buscar alimento/).fill('barra proteica e2e');
      await page.locator('.list-row', { hasText: PRODUCT.name }).getByText('Verificado').waitFor();
      await page.locator('.list-row', { hasText: PRODUCT.name }).click();
      await page.getByRole('dialog').getByText('Verificado').waitFor();
      await page.getByRole('button', { name: 'Os valores conferem com o rótulo' }).waitFor();
    });
  });

  it('Admin > Acervo: possíveis duplicados com "Unir"', async () => {
    await check('admin-acervo', 'admin', '/admin', async (page) => {
      await page.getByRole('button', { name: 'Acervo' }).click();
      await page.getByRole('button', { name: 'Unir' }).first().waitFor();
    });
  });
});

describe('Etapa 6: retorno sem culpa', () => {
  it('card "Que bom te ver por aqui" depois de 5 dias, com os atalhos', async () => {
    await check('retorno', 'b', '/', async (page) => {
      await page.getByText('Que bom te ver por aqui').waitFor();
      await page.getByText('Quer começar pelo café?').waitFor();
      await page.getByRole('button', { name: 'Repetir um favorito' }).waitFor();
      await page.getByRole('link', { name: 'Buscar alimento' }).waitFor();
    }, { init: FAKE_SPEECH });
  });
});

describe('Etapa 7: lista de compras', () => {
  it('escolher receitas e vezes, e a lista somada com "já tenho em casa"', async () => {
    await check('lista-compras', 'a', '/recipes', async (page) => {
      await page.getByRole('button', { name: 'Lista de compras' }).click();
      await page.getByRole('button', { name: /Mais uma vez: Receita E2E Arroz/ }).click();
      await page.getByRole('button', { name: /Mais uma vez: Receita E2E Arroz/ }).click();
      await page.getByRole('button', { name: /Mais uma vez: Receita E2E Feijão/ }).click();
      await page.getByRole('button', { name: /Montar a lista/ }).click();
      // Cebola: (55 x 2) + 55 = 165 -> 170 g
      await page.getByText('170 g').waitFor();
      await page.getByRole('checkbox', { name: 'Já tenho: Cebola' }).check();
    });
  });
});

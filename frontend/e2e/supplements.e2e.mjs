// E2E de "Suplementos e medicações": ativação no Perfil, editor, Hoje (pendente, registrado, "Não registrada"), folha do
// local da aplicação, nomes genéricos, menu "+", marcadores no gráfico de peso, exportação e calendário (.ics).
// Em 402x874, 390x844 e 360x800 (e 320x700 na Hoje), claro e escuro. Confere: sem rolagem horizontal, cabeçalho do
// dropdown em UMA linha, alvos >= 44px, nada atrás da TabBar, nenhuma palavra de cobrança e nenhum vermelho de julgamento.
//
// Precisa do app no ar (API + Next). Uso:
//   E2E_BASE_URL=http://localhost:3000 node --test e2e/supplements.e2e.mjs
//   E2E_SHOTS=/caminho/para/pasta ...   (salva screenshots)
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.E2E_PASSWORD ?? 'senha-e2e-bocado';
const SHOTS = process.env.E2E_SHOTS;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const day = (n) => {
  const d = new Date();
  return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};
const today = day(0);

const USERS = {
  main: { email: 'e2e-supp@example.test', birthDate: '1990-05-10' },
  off: { email: 'e2e-supp-off@example.test', birthDate: '1990-05-10' },
  minor: { email: 'e2e-supp-minor@example.test', birthDate: '2012-06-01' },
};
const NAMES = { inj: 'Injetável semanal', vit: 'Vitamina D', mag: 'Magnésio' };
const VIEWPORTS = [
  { width: 402, height: 874 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
  { width: 320, height: 700 },
];

let browser;
const states = {};

async function session(key) {
  if (states[key]) return states[key];
  const u = USERS[key];
  const ctx = await browser.newContext();
  const req = ctx.request;
  let res = await req.post(`${BASE}/api/auth/login`, { data: { email: u.email, password: PASSWORD } });
  if (!res.ok()) {
    res = await req.post(`${BASE}/api/auth/register`, { data: { name: 'Teste Suplementos', email: u.email, password: PASSWORD } });
    assert.ok(res.ok(), `cadastro: ${res.status()} ${await res.text()}`);
    const p = await req.put(`${BASE}/api/profile`, { data: { sex: 'FEMALE', birthDate: u.birthDate, heightCm: 165, weightKg: 62, activityLevel: 'MODERATE', goal: 'MAINTAIN' } });
    assert.ok(p.ok(), `perfil: ${p.status()} ${await p.text()}`);
  }
  states[key] = { storage: await ctx.storageState(), req };
  if (key === 'main') await seedMain(req);
  if (key === 'off') await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsEnabled: false } });
  return states[key];
}

const json = async (res) => {
  assert.ok(res.ok(), `${res.url()} → ${res.status()} ${await res.text().catch(() => '')}`);
  return res.status() === 204 ? null : res.json();
};

/** Planos, registros e pesos de teste (idempotente: só cria o que falta). */
async function seedMain(req) {
  await json(await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsEnabled: true, supplementsMaskNamesOnHome: false } }));
  const { plans } = await json(await req.get(`${BASE}/api/supplements/plans`));
  if (plans.some((p) => p.name === NAMES.inj)) return;
  const make = async (body) => json(await req.post(`${BASE}/api/supplements/plans`, { data: body }));
  const log = async (planId, date, extra = {}) => json(await req.post(`${BASE}/api/supplements/log`, { data: { planId, date, ...extra } }));
  // Injetável a cada 7 dias: duas doses passadas com local; a próxima vence hoje (pendente) e o local sugerido é o seguinte
  const inj = await make({ name: NAMES.inj, category: 'MEDICATION', administration: 'INJECTION', doseAmount: 0.5, doseUnit: 'ML', scheduleType: 'EVERY_N_DAYS', intervalDays: 7, startDate: day(-30), trackSite: true, showOnWeightChart: true });
  await log(inj.id, day(-14), { site: 'THIGH_L' });
  await log(inj.id, day(-7), { site: 'THIGH_R' });
  // Vitamina diária: hoje pendente; ontem e anteontem... ficam "Não registrada", menos o dia -2 (registrado)
  const vit = await make({ name: NAMES.vit, category: 'VITAMIN', doseAmount: 2000, doseUnit: 'UI', scheduleType: 'DAILY', startDate: day(-5) });
  await log(vit.id, day(-2));
  // Suplemento da noite: já registrado hoje
  const mag = await make({ name: NAMES.mag, category: 'SUPPLEMENT', doseAmount: 2, doseUnit: 'CAPSULE', scheduleType: 'DAILY', slots: ['NIGHT'], startDate: day(0) });
  await log(mag.id, day(0), { slot: 'NIGHT' });
  // Pesos para o gráfico
  for (let n = 20; n >= 0; n -= 4) await req.put(`${BASE}/api/weight/${day(-n)}`, { data: { weightKg: 70 - (20 - n) * 0.05 } });
}

before(async () => {
  browser = await chromium.launch().catch(() => chromium.launch({ channel: 'chrome' }));
});
after(async () => {
  await browser?.close();
});

async function open(key, vp, scheme = 'light', path = '/') {
  const { storage } = await session(key);
  const ctx = await browser.newContext({ storageState: storage, viewport: vp, isMobile: vp.width < 768, hasTouch: vp.width < 768, colorScheme: scheme, reducedMotion: 'reduce', acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}${path}`);
  return { ctx, page };
}

const shot = async (page, name) => SHOTS && (await page.screenshot({ path: `${SHOTS}/${name}.png` }));

/** Apaga sobras de execuções interrompidas (itens criados só pelo teste). */
async function dropTestPlans(req) {
  const { plans } = await json(await req.get(`${BASE}/api/supplements/plans`));
  for (const p of plans.filter((x) => x.name === 'Item e2e')) await req.delete(`${BASE}/api/supplements/plans/${p.id}`);
}

/** O aviso (toast) pode cobrir o próximo alvo: fecha pelo botão "Fechar aviso", como uma pessoa faria. */
const toastGone = async (page) => {
  const close = page.getByRole('button', { name: 'Fechar aviso' });
  if (await close.count()) await close.click({ timeout: 3000 }).catch(() => {});
  await page.locator('.toast-message').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
};

/** Leva o elemento ao meio da tela (a TabBar flutuante não pode cobri-lo) e clica. */
async function press(locator) {
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await locator.click();
}

const metrics = (page, vp) =>
  page.evaluate((w) => {
    const bar = document.querySelector('.tabbar-pill')?.getBoundingClientRect();
    const main = document.querySelector('main');
    const last = main?.lastElementChild?.getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      over: [...document.querySelectorAll('body *')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > w + 1 || r.left < -1) && !e.closest('.chip-strip, svg, [aria-hidden="true"], [inert]');
        })
        .slice(0, 5)
        .map((e) => `${e.tagName.toLowerCase()}.${String(e.className).trim().split(/\s+/)[0]}`),
      // Depois de rolar até o fim, o último bloco tem de terminar acima da TabBar
      tabbarTop: bar?.top ?? null,
      lastBottom: last?.bottom ?? null,
    };
  }, vp.width);

/** Palavras de cobrança e cores de julgamento. */
async function assertTone(page, where) {
  const text = await page.evaluate(() => document.body.innerText);
  assert.doesNotMatch(text, /esquec|atrasad|perdeu|perdida|falhou|streak|adesão/i, `${where}: vocabulário de cobrança`);
  const reds = await page.evaluate(() =>
    [...document.querySelectorAll('.supplements-section *, .supp-row *')]
      .filter((e) => e.children.length === 0 && e.textContent.trim())
      .map((e) => getComputedStyle(e).color.match(/\d+/g).map(Number))
      .filter(([r, g, b]) => r > 170 && g < 90 && b < 90).length,
  );
  assert.equal(reds, 0, `${where}: texto em vermelho dentro do módulo`);
}

describe('acesso e ativação', () => {
  it('menor de 18 anos e módulo desligado: 403 neutro em todas as rotas; o Perfil nem mostra a seção ao menor', async () => {
    const minor = await session('minor');
    const off = await session('off');
    for (const [who, s] of [['menor', minor], ['desligado', off]]) {
      for (const path of ['/supplements/plans', `/supplements/day?date=${today}`, `/supplements/history?from=${day(-5)}&to=${today}`, `/supplements/weight-markers?from=${day(-5)}&to=${today}`]) {
        const res = await s.req.get(`${BASE}/api${path}`);
        assert.equal(res.status(), 403, `${who} ${path}`);
        assert.equal(res.headers()['cache-control'], 'no-store');
      }
    }
    const m = await minor.req.get(`${BASE}/api/supplements/plans`);
    assert.equal((await m.json()).message, 'Este recurso não está disponível para menores de 18 anos.');
    // o menor também não consegue ligar
    const patch = await minor.req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsEnabled: true } });
    assert.equal(patch.status(), 403);

    const { ctx, page } = await open('minor', VIEWPORTS[1], 'light', '/profile');
    await page.waitForSelector('text=Preferências');
    assert.equal(await page.locator('#suplementos').count(), 0, 'seção oculta para menores');
    await page.goto(`${BASE}/supplements`);
    await page.waitForSelector('text=menores de 18 anos');
    await ctx.close();
  });

  it('ativação: desligado por padrão; ao ligar abre a folha com o texto fixo e a privacidade; "Ativar" liga e mostra Gerenciar e os nomes', async () => {
    await session('off');
    const { ctx, page } = await open('off', VIEWPORTS[1], 'light', '/profile');
    const sw = page.getByRole('switch', { name: 'Ativar registro de suplementos e medicações' });
    await sw.waitFor();
    assert.equal(await sw.isChecked(), false);
    assert.equal(await page.getByText('Gerenciar').count(), 0);
    await press(sw);
    const dialog = page.getByRole('dialog', { name: 'Suplementos e medicações' });
    await dialog.waitFor();
    const text = await dialog.innerText();
    assert.match(text, /O Bocado registra o que você informa\. Ele não recomenda, calcula nem ajusta doses\. Para orientações sobre medicações, converse com seu médico ou farmacêutico\./);
    assert.match(text, /Só você vê\. Não aparece na casa, nos relatórios nem em exportações, a menos que você inclua\./);
    await shot(page, 'ativacao-sheet');
    assert.equal(await sw.isChecked(), false, 'ainda desligado antes de confirmar');
    await dialog.getByRole('button', { name: 'Ativar' }).click();
    await page.getByRole('link', { name: /Gerenciar/ }).waitFor();
    assert.equal(await sw.isChecked(), true);
    assert.equal(await page.getByRole('switch', { name: 'Mostrar nomes na tela Hoje' }).isChecked(), true);
    // Sem itens cadastrados, a Hoje e o "+" não mostram nada do módulo
    await page.goto(`${BASE}/`);
    await page.waitForSelector('.gauge-cluster:not([aria-busy])', { timeout: 30000 });
    await page.waitForTimeout(800);
    assert.equal(await page.locator('.supplements-section').count(), 0);
    await page.getByRole('button', { name: 'Adicionar' }).click();
    assert.equal(await page.getByRole('menuitem', { name: /Suplementos/ }).count(), 0);
    await page.keyboard.press('Escape');
    // Estado vazio da lista
    await page.goto(`${BASE}/supplements`);
    await page.getByText('Cadastre o que você toma para registrar com um toque.').waitFor();
    await shot(page, 'lista-vazia');
    await ctx.close();
    await (await session('off')).req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsEnabled: false } });
  });
});

describe('editor e lista (/supplements)', () => {
  for (const vp of VIEWPORTS.slice(0, 3)) {
    for (const scheme of ['light', 'dark']) {
      it(`${vp.width}x${vp.height} ${scheme}: lista, novo item (dose com vírgula), editar com a nota do histórico, arquivar, excluir com confirmação`, async () => {
        await dropTestPlans((await session('main')).req);
        const { ctx, page } = await open('main', vp, scheme, '/supplements');
        await page.getByRole('button', { name: 'Novo' }).waitFor();
        for (const n of Object.values(NAMES)) await page.getByText(n, { exact: true }).first().waitFor();
        assert.ok(await page.getByText('Próxima:').count());
        await shot(page, `lista-${vp.width}-${scheme}`);

        await page.getByRole('button', { name: 'Novo' }).click();
        const dialog = page.getByRole('dialog', { name: 'Novo item' });
        await dialog.waitFor();
        assert.match(await dialog.innerText(), /O Bocado registra o que você informa\. Ele não recomenda, calcula nem ajusta doses\./);
        const save = dialog.getByRole('button', { name: 'Salvar' });
        assert.equal(await save.isDisabled(), true, 'sem nome nem dose não salva');
        await dialog.getByLabel('Nome', { exact: true }).fill('Item e2e');
        await dialog.getByRole('button', { name: 'Medicação', exact: true }).click();
        await dialog.getByRole('button', { name: 'Injetável', exact: true }).click();
        await dialog.getByPlaceholder('Ex.: 0,5 ou 8').fill('0,5');
        await dialog.getByRole('button', { name: 'ml', exact: true }).click();
        await dialog.getByText('Aparece como: 0,5 ml').waitFor();
        // Dias da semana: sem nenhum dia marcado não salva
        await dialog.getByRole('button', { name: 'Dias da semana' }).click();
        assert.equal(await save.isDisabled(), true);
        await dialog.getByRole('button', { name: 'segunda' }).click();
        await dialog.getByRole('button', { name: 'Manhã' }).click();
        await dialog.getByRole('switch', { name: 'Registrar o local da aplicação' }).click();
        await shot(page, `editor-${vp.width}-${scheme}`);
        // Nada de alvo pequeno: chips e botões com >= 44px de altura
        const small = await dialog.evaluate((root) =>
          [...root.querySelectorAll('button.chip, button.btn, .switch-row, button.stepper-btn')].filter((e) => e.getBoundingClientRect().height < 43).length,
        );
        assert.equal(small, 0, 'alvos de toque >= 44px');
        await save.click();
        await dialog.waitFor({ state: 'detached' });
        await page.getByText('Item e2e', { exact: true }).waitFor();

        // Editar: a nota de que a dose nova não altera o histórico; "Adicionar ao calendário" só em item salvo
        await press(page.getByText('Item e2e', { exact: true }));
        const edit = page.getByRole('dialog', { name: 'Editar item' });
        await edit.waitFor();
        assert.match(await edit.innerText(), /Mudar a dose vale daqui para frente: os registros antigos continuam com a dose da época\./);
        assert.ok(await edit.getByRole('button', { name: 'Adicionar ao calendário' }).count());
        await edit.getByRole('button', { name: 'Arquivar', exact: true }).click();
        await edit.waitFor({ state: 'detached' });
        await page.getByRole('heading', { name: 'Arquivados' }).waitFor();
        await toastGone(page);

        // Excluir: confirmação com o texto fixo
        await press(page.getByText('Item e2e', { exact: true }));
        const again = page.getByRole('dialog', { name: 'Editar item' });
        await again.waitFor();
        await again.getByRole('button', { name: 'Excluir', exact: true }).click();
        const confirm = page.getByRole('dialog', { name: 'Excluir item' });
        await confirm.waitFor();
        assert.match(await confirm.innerText(), /Isto apaga o plano e todo o histórico dele\. Para manter o histórico, arquive\./);
        await shot(page, `excluir-${vp.width}-${scheme}`);
        await confirm.getByRole('button', { name: 'Excluir tudo' }).click();
        await page.getByText('Item e2e', { exact: true }).waitFor({ state: 'detached' });

        const m = await metrics(page, vp);
        assert.ok(m.scrollWidth <= vp.width, `rolagem horizontal ${m.scrollWidth}`);
        assert.deepEqual(m.over, []);
        await assertTone(page, `lista ${vp.width}`);
        await ctx.close();
      });
    }
  }

  it('histórico por plano: lista com horário, dose da época e local; tocar edita; a dose do plano muda sem alterar os registros antigos', async () => {
    const { ctx, page } = await open('main', VIEWPORTS[1], 'light', '/supplements');
    await press(page.getByText(NAMES.inj, { exact: true }).first());
    const edit = page.getByRole('dialog', { name: 'Editar item' });
    await edit.waitFor();
    const history = edit.getByRole('region', { name: 'Histórico' });
    await history.waitFor();
    await history.locator('.list-row').first().waitFor();
    const rows = await history.locator('.list-row').allInnerTexts();
    assert.ok(rows.length >= 2);
    assert.match(rows.join('\n'), /0,5 ml · Coxa (esquerda|direita)/);
    await shot(page, 'historico');
    await history.locator('.list-row').first().click();
    const log = page.getByRole('dialog', { name: 'Registro' });
    await log.waitFor();
    assert.ok(await log.getByRole('button', { name: 'Excluir registro' }).count());
    await log.getByRole('button', { name: 'Fechar' }).first().click();
    await ctx.close();
  });
});

describe('Hoje', () => {
  for (const vp of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
      it(`${vp.width}x${vp.height} ${scheme}: dropdown aberto com pendentes, cabeçalho em uma linha, "Não registrada", rodapé, alvos de 44px e sem cobrança`, async () => {
        const { ctx, page } = await open('main', vp, scheme);
        const section = page.locator('.supplements-section');
        await section.waitFor({ timeout: 30000 });
        await page.waitForSelector('.supp-row');
        await page.waitForTimeout(500);

        const head = section.locator('.collapsible-head');
        assert.equal(await head.getAttribute('aria-expanded'), 'true', 'aberto por padrão com item pendente');
        const info = await head.evaluate((el) => {
          const t = el.querySelector('.collapsible-title');
          const s = el.querySelector('.collapsible-summary');
          return { title: t.innerText, summary: s.innerText, h: Math.round(el.getBoundingClientRect().height), sameLine: Math.abs(t.getBoundingClientRect().top - s.getBoundingClientRect().top) < 12, clipped: s.scrollWidth > s.clientWidth + 1 || t.scrollWidth > t.clientWidth + 1 };
        });
        assert.ok(info.h < 56 && info.sameLine && !info.clipped, `cabeçalho em uma linha: ${JSON.stringify(info)}`);
        assert.match(info.title, /^Suplementos( e medicações)?$/);
        assert.match(info.summary, /^\d de \d( registrados)?$/);
        if (vp.width < 300 + 36) assert.match(info.summary, /^\d de \d$/, 'estreito: resumo curto');

        const body = await section.innerText();
        assert.match(body, /Dias anteriores/);
        assert.match(body, /Não registrada · \w{3}/);
        assert.match(body, /Próxima: /);
        assert.match(body, /0,5 ml/);
        assert.ok(await section.getByRole('button', { name: /^Apliquei/ }).count(), 'injetável = "Apliquei"');
        assert.ok(await section.getByRole('button', { name: /^Tomei/ }).count(), 'oral = "Tomei"');

        const small = await section.evaluate((root) => [...root.querySelectorAll('.supp-primary, .supp-more, .collapsible-head')].filter((e) => e.getBoundingClientRect().height < 43 || e.getBoundingClientRect().width < 43).length);
        assert.equal(small, 0, 'alvos >= 44px');

        await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await shot(page, `hoje-${vp.width}-${scheme}`);
        await assertTone(page, `hoje ${vp.width}`);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(300);
        const m = await metrics(page, vp);
        assert.ok(m.scrollWidth <= vp.width, `rolagem horizontal ${m.scrollWidth} > ${vp.width}`);
        assert.deepEqual(m.over, []);
        if (m.tabbarTop !== null && m.lastBottom !== null) assert.ok(m.lastBottom <= m.tabbarTop + 1, `conteúdo atrás da TabBar: ${m.lastBottom} > ${m.tabbarTop}`);
        await ctx.close();
      });
    }
  }

  it('registrar com um toque, desfazer, pular e registrar uma dose de dia anterior com a data original', async () => {
    const { ctx, page } = await open('main', VIEWPORTS[0]);
    const section = page.locator('.supplements-section');
    await section.waitFor({ timeout: 30000 });
    await page.waitForSelector('.supp-row');
    const summary = () => section.locator('.collapsible-summary').innerText();
    const before = await summary();
    assert.match(before, /^1 de 3/);

    // Um toque (oral): registra na hora, com aviso e "Desfazer"
    const vit = section.locator('.supp-row', { hasText: NAMES.vit }).first();
    await press(vit.getByRole('button', { name: /^Tomei/ }));
    await page.getByRole('status').filter({ hasText: 'Registrado' }).waitFor();
    await page.waitForFunction(() => /^2 de 3/.test(document.querySelector('.supplements-section .collapsible-summary')?.textContent ?? ''));
    await shot(page, 'hoje-registrado');
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await page.waitForFunction(() => /^1 de 3/.test(document.querySelector('.supplements-section .collapsible-summary')?.textContent ?? ''));

    // Pular: menu "…", o item vira "Pulado desta vez" e o aviso desfaz
    await press(vit.getByRole('button', { name: /Mais opções/ }));
    const menu = page.getByRole('dialog', { name: NAMES.vit });
    await menu.waitFor();
    for (const t of ['Pular desta vez', 'Registrar outro horário ou data', 'Mudar a dose desta vez', 'Ver histórico']) assert.ok(await menu.getByText(t, { exact: true }).count(), t);
    await shot(page, 'hoje-menu');
    await menu.getByText('Pular desta vez', { exact: true }).click();
    await section.getByText('Pulado desta vez').first().waitFor();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await section.getByText('Pulado desta vez').waitFor({ state: 'detached' });

    // Mudar a dose só desta vez: o registro guarda a dose informada e o plano não muda
    await press(vit.getByRole('button', { name: /Mais opções/ }));
    await page.getByRole('dialog', { name: NAMES.vit }).getByText('Mudar a dose desta vez', { exact: true }).click();
    const dose = page.getByRole('dialog', { name: 'Mudar a dose desta vez' });
    await dose.getByLabel('Dose').fill('1500');
    await dose.getByRole('button', { name: 'Registrar com esta dose' }).click();
    await section.getByText('1500 UI').first().waitFor();
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await section.getByText('1500 UI').waitFor({ state: 'detached' });
    assert.ok(await section.getByText('2000 UI').count(), 'a dose do plano continua 2000');

    // "Não registrada · dia": registrar com a data original tira da lista; desfazer devolve
    const unlogged = section.locator('.supp-row[data-status="unlogged"]').first();
    await unlogged.waitFor();
    const count = await section.locator('.supp-row[data-status="unlogged"]').count();
    await press(unlogged.getByRole('button', { name: /^Tomei/ }));
    await page.waitForFunction((n) => document.querySelectorAll('.supp-row[data-status="unlogged"]').length === n - 1, count);
    await page.getByRole('button', { name: 'Desfazer' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.supp-row[data-status="unlogged"]').length === n, count);
    await ctx.close();
  });

  it('injetável com local: o toque abre a folha com o local sugerido (rodízio) pré-selecionado; "Registrar" e "Sem local"; desfazer pelo menu', async () => {
    for (const scheme of ['light', 'dark']) {
      const { ctx, page } = await open('main', VIEWPORTS[0], scheme);
      const section = page.locator('.supplements-section');
      await section.waitFor({ timeout: 30000 });
      await page.waitForSelector('.supp-row');
      const inj = section.locator('.supp-row', { hasText: NAMES.inj }).first();
      await press(inj.getByRole('button', { name: /^Apliquei/ }));
      const sheet = page.getByRole('dialog', { name: 'Local da aplicação' });
      await sheet.waitFor();
      // As doses passadas foram na coxa esquerda e na direita: o rodízio sugere o glúteo esquerdo
      const chip = sheet.getByRole('button', { name: /Glúteo esquerdo/ });
      assert.equal(await chip.getAttribute('aria-pressed'), 'true');
      assert.match(await chip.innerText(), /sugestão de rodízio/);
      assert.ok(await sheet.getByRole('button', { name: 'Sem local' }).count());
      await shot(page, `local-${scheme}`);
      const small = await sheet.evaluate((root) => [...root.querySelectorAll('button.chip, button.btn')].filter((e) => e.getBoundingClientRect().height < 43).length);
      assert.equal(small, 0);
      await sheet.getByRole('button', { name: 'Registrar', exact: true }).click();
      await inj.getByText(/Registrado/).waitFor();
      // Desfazer pelo menu "…"
      await press(inj.getByRole('button', { name: /Mais opções/ }));
      await page.getByRole('dialog', { name: NAMES.inj }).getByText('Desfazer registro', { exact: true }).click();
      await inj.getByRole('button', { name: /^Apliquei/ }).waitFor();
      await ctx.close();
    }
  });

  it('"Mostrar nomes na tela Hoje" desligado: a Hoje só mostra nomes genéricos; as outras telas mostram o nome real', async () => {
    const { req } = await session('main');
    await json(await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsMaskNamesOnHome: true } }));
    try {
      for (const vp of VIEWPORTS.slice(0, 3)) {
        const { ctx, page } = await open('main', vp, 'dark');
        const section = page.locator('.supplements-section');
        await section.waitFor({ timeout: 30000 });
        await page.waitForSelector('.supp-row');
        // O dropdown abre sozinho quando os dados chegam (há item pendente): só então o texto das linhas fica visível
        await page.waitForFunction(() => document.querySelector('.supplements-section .collapsible-head')?.getAttribute('aria-expanded') === 'true');
        const text = await section.innerText();
        for (const n of Object.values(NAMES)) assert.ok(!text.includes(n), `nome real "${n}" apareceu na Hoje com a máscara`);
        assert.match(text, /Medicação 1/);
        assert.match(text, /Suplemento 2/);
        // Toda linha com nome genérico (espera a condição: o painel acabou de abrir e o texto aparece no quadro seguinte)
        await page
          .waitForFunction(() => [...document.querySelectorAll('.supplements-section .supp-row')].every((r) => /(Medicação|Suplemento) \d/.test(r.innerText)), null, { timeout: 8000 })
          .catch(async () => assert.fail(`${vp.width}px: linhas sem nome genérico: ${JSON.stringify(await section.locator('.supp-row').allInnerTexts())}`));
        await section.evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await shot(page, `hoje-mascara-${vp.width}`);
        const m = await metrics(page, vp);
        assert.ok(m.scrollWidth <= vp.width);
        await ctx.close();
      }
      // O gerenciamento (e os campos de edição) mostram o nome real
      const { ctx, page } = await open('main', VIEWPORTS[1], 'light', '/supplements');
      await page.getByText(NAMES.inj, { exact: true }).first().waitFor();
      await ctx.close();
    } finally {
      await json(await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsMaskNamesOnHome: false } }));
    }
  });
});

describe('menu "+" e Sidebar', () => {
  it('o "+" ganha "Suplementos" (só com o módulo ativo e item cadastrado); a folha lista os itens de hoje com o botão de registro', async () => {
    for (const vp of VIEWPORTS.slice(0, 3)) {
      const { ctx, page } = await open('main', vp, 'light', '/profile');
      await page.waitForSelector('text=Preferências');
      await page.getByRole('button', { name: 'Adicionar' }).click();
      const item = page.getByRole('menuitem', { name: /Suplementos/ });
      await item.waitFor();
      await shot(page, `mais-menu-${vp.width}`);
      await item.click();
      const sheet = page.getByRole('dialog', { name: 'Suplementos e medicações' });
      await sheet.waitFor();
      await sheet.locator('.supp-row').first().waitFor();
      assert.ok(await sheet.getByRole('button', { name: /^(Tomei|Apliquei)/ }).count());
      await shot(page, `mais-folha-${vp.width}`);
      await assertTone(page, '+');
      await ctx.close();
    }
  });

  it('desktop: a Sidebar ganha o atalho (só com o módulo ativo)', async () => {
    const { ctx, page } = await open('main', { width: 1280, height: 800 }, 'light', '/');
    await page.getByRole('complementary', { name: 'Navegação lateral' }).getByRole('button', { name: /Suplementos/ }).waitFor();
    await shot(page, 'sidebar-1280');
    await ctx.close();
    const off = await open('off', { width: 1280, height: 800 }, 'light', '/');
    await off.page.getByRole('complementary', { name: 'Navegação lateral' }).waitFor();
    await off.page.waitForTimeout(800);
    assert.equal(await off.page.getByRole('button', { name: /^Suplementos/ }).count(), 0);
    await off.ctx.close();
  });
});

describe('gráfico de peso', () => {
  for (const vp of VIEWPORTS.slice(0, 3)) {
    for (const scheme of ['light', 'dark']) {
      it(`${vp.width}x${vp.height} ${scheme}: traços de dose na faixa abaixo do gráfico, legenda "Doses", tocar mostra o nome e a data`, async () => {
        const { ctx, page } = await open('main', vp, scheme, '/profile');
        const chart = page.locator('.weight-chart');
        await chart.waitFor({ timeout: 30000 });
        // A <line> vertical tem largura 0 (o Playwright a trata como invisível): basta estar no DOM
        await page.waitForSelector('.weight-chart-marker', { state: 'attached' });
        assert.ok((await page.locator('.weight-chart-marker').count()) >= 2);
        assert.ok(await page.locator('.weight-chart-legend', { hasText: 'Doses' }).count());
        // Os traços ficam abaixo da área do gráfico (nunca sobre a tendência)
        const geom = await chart.evaluate((svg) => {
          const trend = svg.querySelector('.weight-chart-trend')?.getBBox();
          const ys = [...svg.querySelectorAll('.weight-chart-marker')].map((l) => Number(l.getAttribute('y1')));
          return { trendBottom: trend ? trend.y + trend.height : 0, markerTop: Math.min(...ys) };
        });
        assert.ok(geom.markerTop > geom.trendBottom, `marcador (${geom.markerTop}) sobre a tendência (${geom.trendBottom})`);
        await press(page.locator('.weight-chart-marker-hit').first());
        const note = page.locator('.weight-marker-note');
        await note.waitFor();
        assert.match(await note.innerText(), new RegExp(NAMES.inj));
        await chart.evaluate((el) => el.scrollIntoView({ block: 'center' }));
        await shot(page, `grafico-${vp.width}-${scheme}`);
        const m = await metrics(page, vp);
        assert.ok(m.scrollWidth <= vp.width);
        await ctx.close();
      });
    }
  }

  it('com a máscara ligada, o gráfico mostra o nome genérico', async () => {
    const { req } = await session('main');
    await json(await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsMaskNamesOnHome: true } }));
    try {
      const { ctx, page } = await open('main', VIEWPORTS[1], 'light', '/profile');
      // A <line> vertical tem largura 0 (o Playwright a trata como invisível): basta estar no DOM
        await page.waitForSelector('.weight-chart-marker', { state: 'attached' });
      await press(page.locator('.weight-chart-marker-hit').first());
      const text = await page.locator('.weight-marker-note').innerText();
      assert.match(text, /Medicação 1/);
      assert.doesNotMatch(text, new RegExp(NAMES.inj));
      await ctx.close();
    } finally {
      await json(await req.patch(`${BASE}/api/profile/preferences`, { data: { supplementsMaskNamesOnHome: false } }));
    }
  });
});

describe('exportação e calendário', () => {
  it('exportação: a opção de suplementos começa desligada; ligada, baixa o CSV com o nome real e a dose da época', async () => {
    const { ctx, page } = await open('main', VIEWPORTS[1], 'light', '/profile');
    const sw = page.getByRole('switch', { name: 'Incluir suplementos e medicações (dado sensível)' });
    await sw.waitFor();
    assert.equal(await sw.isChecked(), false);
    assert.equal(await page.getByRole('button', { name: 'Suplementos', exact: true }).count(), 0, 'sem a opção ligada, o tipo não aparece');
    await press(sw);
    await page.getByRole('button', { name: 'Suplementos', exact: true }).waitFor();
    await page.getByRole('button', { name: '1 mês' }).click();
    const [download] = await Promise.all([page.waitForEvent('download'), press(page.getByRole('button', { name: 'Baixar CSV' }))]);
    assert.match(download.suggestedFilename(), /^bocado-suplementos-/);
    const csv = readFileSync(await download.path(), 'utf8');
    assert.ok(csv.startsWith('﻿Data;Item;Dose;Unidade;Status;Local'));
    assert.match(csv, /Injetável semanal;0,5;ml;Registrado;Coxa (esquerda|direita)/);
    await shot(page, 'exportacao');
    await ctx.close();

    // Outra visita: a opção volta desligada (nunca lembrada)
    const again = await open('main', VIEWPORTS[1], 'light', '/profile');
    const sw2 = again.page.getByRole('switch', { name: 'Incluir suplementos e medicações (dado sensível)' });
    await sw2.waitFor();
    assert.equal(await sw2.isChecked(), false);
    await again.ctx.close();

    // Módulo desligado: a opção nem existe
    const off = await open('off', VIEWPORTS[1], 'light', '/profile');
    await off.page.waitForSelector('text=Exportar dados');
    assert.equal(await off.page.getByText('Incluir suplementos e medicações').count(), 0);
    await off.ctx.close();
  });

  it('calendário: título genérico por padrão; o arquivo não leva nome nem dose; nome e dose só por escolha explícita', async () => {
    const { ctx, page } = await open('main', VIEWPORTS[1], 'dark', '/supplements');
    await press(page.getByText(NAMES.inj, { exact: true }).first());
    const edit = page.getByRole('dialog', { name: 'Editar item' });
    await edit.waitFor();
    await edit.getByRole('button', { name: 'Adicionar ao calendário' }).click();
    const sheet = page.getByRole('dialog', { name: 'Adicionar ao calendário' });
    await sheet.waitFor();
    assert.equal(await sheet.getByRole('switch', { name: /Título genérico/ }).isChecked(), true);
    assert.equal(await sheet.getByRole('switch', { name: 'Incluir dose no título' }).isChecked(), false);
    assert.match(await sheet.innerText(), /Arquivos de calendário ficam no seu aparelho, fora do Bocado\./);
    await shot(page, 'calendario');
    const save = async () => {
      const [dl] = await Promise.all([page.waitForEvent('download'), sheet.getByRole('button', { name: 'Adicionar ao calendário' }).click()]);
      assert.equal(dl.suggestedFilename(), 'bocado-lembrete.ics');
      return readFileSync(await dl.path(), 'utf8').replace(/\r\n /g, '');
    };
    const generic = await save();
    assert.match(generic, /SUMMARY:Lembrete do Bocado/);
    assert.match(generic, /RRULE:FREQ=DAILY;INTERVAL=7/);
    assert.match(generic, /BEGIN:VALARM/);
    assert.doesNotMatch(generic, /Injetável|0,5/);
    await ctx.close();
  });
});

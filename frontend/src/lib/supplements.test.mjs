// Suplementos e medicações: a dose aparece exatamente como digitada, nomes genéricos, frequência, janela e vocabulário
// sem culpa. Roda com: npm test
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  activePlans,
  archivedPlans,
  displayName,
  doseIsValid,
  doseLine,
  doseText,
  frequencyText,
  genericNames,
  hasPending,
  localToISO,
  nextLine,
  parseDose,
  progressSummary,
  siteLabel,
  splitItems,
  SITES,
  SUPPLEMENTS_PRINCIPLES,
  timeText,
  unloggedLabel,
  verbFor,
  weekdayShort,
  whenText,
} from './supplements.ts';
import { isSectionOpen, readSections } from './movement.ts';

const item = (over = {}) => ({
  planId: 'p1',
  name: 'Vitamina D',
  category: 'VITAMIN',
  administration: 'ORAL',
  trackSite: false,
  doseAmount: 2000,
  doseUnit: 'UI',
  doseUnitLabel: null,
  slot: 'ANY',
  status: 'pending',
  dueDate: '2026-11-18',
  ...over,
});

describe('dose: exatamente o que a pessoa digitou', () => {
  it('aceita vírgula e ponto; vazio e texto são inválidos; nada é arredondado', () => {
    assert.equal(parseDose('0,5'), 0.5);
    assert.equal(parseDose('8'), 8);
    assert.equal(parseDose(' 2.25 '), 2.25);
    assert.equal(parseDose('.5'), 0.5);
    assert.equal(parseDose('0,0001'), 0.0001);
    for (const bad of ['', ' ', 'abc', '1,2,3', '1e3', '-1', '--', ',']) assert.equal(parseDose(bad), null, bad);
  });

  it('só a regra do servidor: maior que zero e até 100000 (nenhuma faixa por medicamento)', () => {
    assert.equal(doseIsValid(null), false);
    assert.equal(doseIsValid(0), false);
    assert.equal(doseIsValid(0.001), true);
    assert.equal(doseIsValid(99_999), true);
    assert.equal(doseIsValid(100_000), true);
    assert.equal(doseIsValid(100_001), false);
  });

  it('texto da dose com vírgula decimal e a unidade escolhida; "Outro" usa o texto da pessoa', () => {
    assert.equal(doseText(0.5, 'ML', null), '0,5 ml');
    assert.equal(doseText(8, 'DROP', null), '8 gotas');
    assert.equal(doseText(2000, 'UI', null), '2000 UI');
    assert.equal(doseText(2.25, 'OTHER', ' unidades '), '2,25 unidades');
    assert.equal(doseText(1, 'SCOOP', null), '1 dose/scoop');
  });

  it('"0,5 ml · Manhã"; sem horário, só a dose', () => {
    assert.equal(doseLine(item({ doseAmount: 0.5, doseUnit: 'ML', slot: 'MORNING' })), '0,5 ml · Manhã');
    assert.equal(doseLine(item({ doseAmount: 0.5, doseUnit: 'ML', slot: 'ANY' })), '0,5 ml');
  });

  it('o verbo certo: "Apliquei" para injetável, "Tomei" para o resto', () => {
    assert.equal(verbFor('INJECTION'), 'Apliquei');
    assert.equal(verbFor('ORAL'), 'Tomei');
    assert.equal(verbFor('OTHER'), 'Tomei');
  });
});

describe('nomes genéricos (Mostrar nomes na tela Hoje desligado)', () => {
  const plans = [
    { id: 'a', category: 'MEDICATION', archived: false, createdAt: '2026-01-01T00:00:00Z' },
    { id: 'b', category: 'VITAMIN', archived: false, createdAt: '2026-01-02T00:00:00Z' },
    { id: 'c', category: 'SUPPLEMENT', archived: true, createdAt: '2026-01-03T00:00:00Z' },
    { id: 'd', category: 'OTHER', archived: false, createdAt: '2026-01-04T00:00:00Z' },
  ];
  it('"Medicação 1", "Suplemento 2"...: pela ordem de cadastro, só entre os ativos', () => {
    const g = genericNames(plans);
    assert.equal(g.get('a'), 'Medicação 1');
    assert.equal(g.get('b'), 'Suplemento 2');
    assert.equal(g.get('d'), 'Suplemento 3');
    assert.equal(g.has('c'), false);
  });
  it('com a máscara ligada o nome real nunca aparece; sem ela, o real', () => {
    const g = genericNames(plans);
    assert.equal(displayName({ id: 'a', name: 'Nome Secreto' }, true, g), 'Medicação 1');
    assert.equal(displayName({ id: 'a', name: 'Nome Secreto' }, false, g), 'Nome Secreto');
    assert.equal(displayName({ id: 'zz', name: 'Nome Secreto' }, true, g), 'Suplemento');
  });
  it('as listas de ativos e arquivados', () => {
    assert.deepEqual(activePlans(plans).map((p) => p.id), ['a', 'b', 'd']);
    assert.deepEqual(archivedPlans(plans).map((p) => p.id), ['c']);
    assert.deepEqual(activePlans(undefined), []);
  });
});

describe('frequência em texto', () => {
  it('todo dia, dias da semana, a cada N dias e horários', () => {
    assert.equal(frequencyText({ scheduleType: 'DAILY', weekdays: [], intervalDays: null, slots: ['ANY'] }), 'Todo dia');
    assert.equal(frequencyText({ scheduleType: 'WEEKDAYS', weekdays: [4, 1], intervalDays: null, slots: ['ANY'] }), 'Seg, qui');
    assert.equal(frequencyText({ scheduleType: 'WEEKDAYS', weekdays: [0, 6], intervalDays: null, slots: ['ANY'] }), 'Sáb, dom');
    assert.equal(frequencyText({ scheduleType: 'EVERY_N_DAYS', weekdays: [], intervalDays: 7, slots: ['ANY'] }), 'A cada 7 dias');
    assert.equal(frequencyText({ scheduleType: 'DAILY', weekdays: [], intervalDays: null, slots: ['NIGHT', 'MORNING'] }), 'Todo dia · manhã e noite');
    assert.equal(frequencyText({ scheduleType: 'DAILY', weekdays: [], intervalDays: null, slots: ['MORNING', 'AFTERNOON', 'NIGHT'] }), 'Todo dia · manhã, tarde e noite');
  });
});

describe('o dia: pendências, "Não registrada" e resumo', () => {
  const today = '2026-11-18';
  const items = [
    item({ status: 'taken', takenAt: '2026-11-18T12:30:00.000Z', planId: 'a' }),
    item({ status: 'pending', planId: 'b' }),
    item({ status: 'skipped', planId: 'c' }),
    item({ status: 'unlogged', planId: 'd', dueDate: '2026-11-16' }),
  ];
  it('separa o dia dos dias anteriores (só o que ficou sem registro)', () => {
    const { today: t, earlier } = splitItems(items, today);
    assert.deepEqual(t.map((i) => i.planId), ['a', 'b', 'c']);
    assert.deepEqual(earlier.map((i) => i.planId), ['d']);
  });
  it('"2 de 3 registrados" (curto: "2 de 3"); sem itens no dia, vazio; só o dia conta, não as pendências antigas', () => {
    assert.equal(progressSummary(items, today), '1 de 3 registrados');
    assert.equal(progressSummary(items, today, true), '1 de 3');
    assert.equal(progressSummary([item({ status: 'taken' })], today), '1 de 1 registrado');
    assert.equal(progressSummary([], today), '');
  });
  it('aberto por padrão só com pendência (hoje ou de dias anteriores)', () => {
    assert.equal(hasPending(items), true);
    assert.equal(hasPending([item({ status: 'taken' }), item({ status: 'skipped' })]), false);
    assert.equal(hasPending([]), false);
  });
  it('"Não registrada · seg"', () => {
    assert.equal(weekdayShort('2026-11-16'), 'seg');
    assert.equal(unloggedLabel('2026-11-16'), 'Não registrada · seg');
  });
  it('próxima dose: "hoje", "amanhã" ou o dia da semana', () => {
    assert.equal(whenText('2026-11-18', today), 'hoje');
    assert.equal(whenText('2026-11-19', today), 'amanhã');
    assert.equal(whenText('2026-11-23', today), 'seg');
    assert.equal(whenText('2026-12-01', '2026-11-30'), 'amanhã'); // virada de mês
    assert.equal(nextLine('Injetável semanal', '2026-11-23', today), 'Próxima: Injetável semanal · seg');
  });
  it('horário local e conversão para ISO ida e volta', () => {
    const iso = localToISO('2026-11-18', '08:30');
    assert.equal(timeText(iso), '08:30');
    assert.equal(timeText(null), '');
    assert.equal(timeText('lixo'), '');
  });
});

describe('locais de aplicação', () => {
  it('rótulos em português; a ordem do rodízio tem os 8 locais e depois "Outro"', () => {
    assert.equal(siteLabel('THIGH_L'), 'Coxa esquerda');
    assert.equal(SITES.length, 9);
    assert.equal(SITES.at(-1).value, 'OTHER');
    assert.equal(SITES[0].value, 'ABDOMEN_L');
  });
});

describe('dropdown da Hoje: aberto/fechado', () => {
  it('aberto por padrão só com item pendente; o estado manual vale sobre o padrão', () => {
    assert.equal(isSectionOpen('supplements', {}, { hasWorkouts: false, hasPendingSupplements: true }), true);
    assert.equal(isSectionOpen('supplements', {}, { hasWorkouts: true, hasPendingSupplements: false }), false);
    assert.equal(isSectionOpen('supplements', {}, { hasWorkouts: false }), false);
    assert.equal(isSectionOpen('supplements', { supplements: false }, { hasWorkouts: false, hasPendingSupplements: true }), false);
    assert.equal(isSectionOpen('supplements', { supplements: true }, { hasWorkouts: false, hasPendingSupplements: false }), true);
    // as outras seções seguem iguais
    assert.equal(isSectionOpen('meals', {}, { hasWorkouts: false }), true);
    assert.equal(isSectionOpen('activities', {}, { hasWorkouts: false }), false);
  });
  it('o estado guardado no aparelho aceita a seção nova e ignora lixo', () => {
    const store = (v) => ({ getItem: () => v });
    assert.deepEqual(readSections(store('{"supplements":false,"meals":true,"x":1}'), 'k'), { supplements: false, meals: true });
  });
});

describe('textos: tom sem culpa e princípios', () => {
  it('o texto fixo de princípios', () => {
    assert.equal(
      SUPPLEMENTS_PRINCIPLES,
      'O Bocado registra o que você informa. Ele não recomenda, calcula nem ajusta doses. Para orientações sobre medicações, converse com seu médico ou farmacêutico.',
    );
  });

  it('nenhum arquivo do módulo usa vocabulário de cobrança ("esqueceu", "atrasada", "perdeu a dose", "falhou")', () => {
    const root = new URL('../', import.meta.url);
    const files = [
      'lib/supplements.ts',
      'lib/useSupplements.ts',
      ...readdirSync(new URL('components/', root)).filter((f) => /^Supplement/.test(f)).map((f) => `components/${f}`),
    ];
    assert.ok(files.length >= 6, 'os arquivos do módulo foram encontrados');
    // A regra vale para o texto da interface; os comentários podem citar as palavras para dizer que nunca devem aparecer
    const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    for (const f of files) {
      assert.doesNotMatch(code(readFileSync(new URL(f, root), 'utf8')), /esquec|atrasad|perdeu|perdid|falhou|streak|sequência|adesão|% de ades/i, f);
    }
  });

  it('sem banco de medicamentos, interação ou "dose recomendada" em nenhum texto', () => {
    const src = readFileSync(new URL('./supplements.ts', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /recomendad|interaç|dose máxima|dose segura|bula/i);
  });
});

import { dueOn, nextDue, normalizeSlots, type PlanSchedule, SITE_CYCLE, suggestedSite, windowDates } from './supplements.schedule';

const plan = (over: Partial<PlanSchedule> = {}): PlanSchedule => ({
  scheduleType: 'DAILY',
  weekdays: [],
  intervalDays: null,
  startDate: '2026-11-02', // segunda-feira
  endDate: null,
  ...over,
});

describe('dueOn: todo dia', () => {
  it('vence todo dia entre o início e o fim (inclusive); nada antes do início nem depois do fim', () => {
    const p = plan({ endDate: '2026-11-10' });
    expect(dueOn(p, '2026-11-01')).toBe(false);
    expect(dueOn(p, '2026-11-02')).toBe(true);
    expect(dueOn(p, '2026-11-06')).toBe(true);
    expect(dueOn(p, '2026-11-10')).toBe(true);
    expect(dueOn(p, '2026-11-11')).toBe(false);
  });
  it('sem data de fim, vence indefinidamente', () => expect(dueOn(plan(), '2030-01-01')).toBe(true));
});

describe('dueOn: dias da semana (0 = domingo … 6 = sábado)', () => {
  const p = plan({ scheduleType: 'WEEKDAYS', weekdays: [1, 4] }); // seg e qui
  it('só nos dias listados', () => {
    expect(dueOn(p, '2026-11-02')).toBe(true); // seg
    expect(dueOn(p, '2026-11-03')).toBe(false); // ter
    expect(dueOn(p, '2026-11-05')).toBe(true); // qui
    expect(dueOn(p, '2026-11-08')).toBe(false); // dom
  });
  it('domingo e sábado', () => {
    const w = plan({ scheduleType: 'WEEKDAYS', weekdays: [0, 6], startDate: '2026-01-01' });
    expect(dueOn(w, '2026-11-08')).toBe(true); // dom
    expect(dueOn(w, '2026-11-07')).toBe(true); // sáb
    expect(dueOn(w, '2026-11-09')).toBe(false);
  });
  it('respeita início e fim', () => {
    const w = plan({ scheduleType: 'WEEKDAYS', weekdays: [1], startDate: '2026-11-09', endDate: '2026-11-16' });
    expect(dueOn(w, '2026-11-02')).toBe(false);
    expect(dueOn(w, '2026-11-09')).toBe(true);
    expect(dueOn(w, '2026-11-16')).toBe(true);
    expect(dueOn(w, '2026-11-23')).toBe(false);
  });
});

describe('dueOn: a cada N dias (rolling)', () => {
  const p = plan({ scheduleType: 'EVERY_N_DAYS', intervalDays: 7 });
  it('sem registro: vence na data de início', () => {
    expect(dueOn(p, '2026-11-02', null)).toBe(true);
    expect(dueOn(p, '2026-11-09', null)).toBe(false);
  });
  it('com registro: vence no dia do último registro + N, e só nele', () => {
    const last = { date: '2026-11-04' };
    expect(dueOn(p, '2026-11-10', last)).toBe(false);
    expect(dueOn(p, '2026-11-11', last)).toBe(true);
    expect(dueOn(p, '2026-11-12', last)).toBe(false);
  });
  it('dose atrasada empurra a agenda: registrar 3 dias depois move a próxima para +N dali', () => {
    // previsto dia 9, registrado com a data do dia 12: a próxima é 19, não 16
    expect(dueOn(p, '2026-11-16', { date: '2026-11-12' })).toBe(false);
    expect(dueOn(p, '2026-11-19', { date: '2026-11-12' })).toBe(true);
  });
  it('pular também conta como registro (a âncora é a data do registro, qualquer status)', () => {
    expect(dueOn(p, '2026-11-16', { date: '2026-11-09' })).toBe(true);
  });
  it('respeita o fim: depois dele não vence mais', () => {
    const e = plan({ scheduleType: 'EVERY_N_DAYS', intervalDays: 3, endDate: '2026-11-08' });
    expect(dueOn(e, '2026-11-05', { date: '2026-11-02' })).toBe(true);
    expect(dueOn(e, '2026-11-11', { date: '2026-11-08' })).toBe(false);
  });
  it('último registro anterior ao início do plano não adianta a primeira dose', () => {
    const later = plan({ scheduleType: 'EVERY_N_DAYS', intervalDays: 2, startDate: '2026-11-20' });
    expect(dueOn(later, '2026-11-20', { date: '2026-11-01' })).toBe(true);
  });
  it('sem intervalo definido, nunca vence', () => expect(dueOn(plan({ scheduleType: 'EVERY_N_DAYS' }), '2026-11-02')).toBe(false));
});

describe('nextDue', () => {
  it('todo dia: a própria data (ou o início, se ainda não começou); encerrado = null', () => {
    expect(nextDue(plan(), '2026-11-05')).toBe('2026-11-05');
    expect(nextDue(plan({ startDate: '2026-12-01' }), '2026-11-05')).toBe('2026-12-01');
    expect(nextDue(plan({ endDate: '2026-11-10' }), '2026-11-11')).toBeNull();
  });
  it('dias da semana: o próximo dia listado, a partir da data (inclusive)', () => {
    const p = plan({ scheduleType: 'WEEKDAYS', weekdays: [1, 4] });
    expect(nextDue(p, '2026-11-02')).toBe('2026-11-02'); // seg
    expect(nextDue(p, '2026-11-03')).toBe('2026-11-05'); // qui
    expect(nextDue(p, '2026-11-06')).toBe('2026-11-09'); // seg seguinte
    expect(nextDue(plan({ scheduleType: 'WEEKDAYS', weekdays: [1], endDate: '2026-11-03' }), '2026-11-04')).toBeNull();
  });
  it('a cada N dias: a âncora; se já passou, projeta de N em N sem empurrar para amanhã', () => {
    const p = plan({ scheduleType: 'EVERY_N_DAYS', intervalDays: 7 });
    expect(nextDue(p, '2026-11-10', { date: '2026-11-09' })).toBe('2026-11-16');
    expect(nextDue(p, '2026-11-03', null)).toBe('2026-11-09'); // início 02 + 7
    // dose de hoje ainda não registrada (âncora = hoje): do dia seguinte em diante, é daqui a N dias
    expect(nextDue(p, '2026-11-10', { date: '2026-11-03' })).toBe('2026-11-10');
    expect(nextDue(p, '2026-11-11', { date: '2026-11-03' })).toBe('2026-11-17');
    expect(nextDue(plan({ scheduleType: 'EVERY_N_DAYS', intervalDays: 7, endDate: '2026-11-12' }), '2026-11-11', { date: '2026-11-03' })).toBeNull();
  });
});

describe('janela de pendências e horários', () => {
  it('janela: o dia e os 3 anteriores, em ordem', () => {
    expect(windowDates('2026-11-18')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']);
    expect(windowDates('2026-03-02')[0]).toBe('2026-02-27');
  });
  it('slots: nenhum = qualquer hora; "qualquer hora" não convive com os outros; sem repetidos', () => {
    expect(normalizeSlots(undefined)).toEqual(['ANY']);
    expect(normalizeSlots([])).toEqual(['ANY']);
    expect(normalizeSlots(['ANY', 'MORNING'])).toEqual(['MORNING']);
    expect(normalizeSlots(['NIGHT', 'MORNING', 'NIGHT'])).toEqual(['NIGHT', 'MORNING']);
  });
});

describe('suggestedSite (só um ciclo de conveniência)', () => {
  it('sem histórico, o primeiro; depois, o seguinte ao último usado, voltando ao início no fim', () => {
    expect(suggestedSite([])).toBe('ABDOMEN_L');
    expect(suggestedSite([{ date: '2026-11-01', site: 'ABDOMEN_L' }])).toBe('ABDOMEN_R');
    expect(suggestedSite([{ date: '2026-11-01', site: 'DELTOID_R' }])).toBe('ABDOMEN_L');
  });
  it('vale o último por data (não a ordem da lista); ignora registros sem local', () => {
    const h = [
      { date: '2026-11-10', site: 'THIGH_L' as const },
      { date: '2026-11-03', site: 'ABDOMEN_R' as const },
      { date: '2026-11-17', site: null },
    ];
    expect(suggestedSite(h)).toBe('THIGH_R');
  });
  it('"Outro" não está no ciclo: recomeça do primeiro', () => expect(suggestedSite([{ date: '2026-11-01', site: 'OTHER' }])).toBe('ABDOMEN_L'));
  it('o ciclo tem os 8 locais, sem "Outro", e cada um aparece uma vez', () => {
    expect(SITE_CYCLE).toHaveLength(8);
    expect(new Set(SITE_CYCLE).size).toBe(8);
    expect(SITE_CYCLE).not.toContain('OTHER');
  });
});

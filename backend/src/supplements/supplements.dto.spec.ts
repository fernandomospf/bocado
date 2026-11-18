import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreferencesDto } from '../profile/dto/profile.dto';
import { CalendarQueryDto, CreatePlanDto, LogDto } from './dto/supplements.dto';

const opts = { whitelist: true, forbidNonWhitelisted: true };
const errorsOf = <T extends object>(cls: new () => T, plain: object) => validate(plainToInstance(cls, plain), opts);
const messages = async <T extends object>(cls: new () => T, plain: object) =>
  (await errorsOf(cls, plain)).flatMap((e) => Object.values(e.constraints ?? {}));

const ok = { name: 'Vitamina D', category: 'VITAMIN', doseAmount: 2000, doseUnit: 'UI', scheduleType: 'DAILY', startDate: '2026-11-01' };

describe('CreatePlanDto', () => {
  it('aceita um plano mínimo e o completo', async () => {
    expect(await errorsOf(CreatePlanDto, ok)).toHaveLength(0);
    expect(
      await errorsOf(CreatePlanDto, {
        ...ok,
        administration: 'INJECTION',
        doseUnit: 'OTHER',
        doseUnitLabel: 'unidades',
        scheduleType: 'WEEKDAYS',
        weekdays: [1, 4],
        slots: ['MORNING', 'NIGHT'],
        endDate: '2026-12-31',
        notes: 'n'.repeat(280),
        trackSite: true,
        showOnWeightChart: true,
      }),
    ).toHaveLength(0);
  });

  it.each(['x', 'x'.repeat(60), '  Ab  '])('aceita o nome %j (limite 1 a 60, com aparas)', async (name) => {
    expect(await errorsOf(CreatePlanDto, { ...ok, name })).toHaveLength(0);
  });
  it.each(['', '   ', 'x'.repeat(61)])('rejeita o nome %j', async (name) => expect((await errorsOf(CreatePlanDto, { ...ok, name })).length).toBeGreaterThan(0));

  it.each([0.0001, 1, 99_999.9, 100_000])('dose %p: aceita (sem outra validação)', async (doseAmount) => expect(await errorsOf(CreatePlanDto, { ...ok, doseAmount })).toHaveLength(0));
  it.each([0, -1, 100_000.01, '5', null, Number.NaN, Infinity])('dose %p: rejeita', async (doseAmount) => expect((await errorsOf(CreatePlanDto, { ...ok, doseAmount })).length).toBeGreaterThan(0));

  it('unidade "Outro" exige o texto (até 20 caracteres); as outras não precisam', async () => {
    expect((await errorsOf(CreatePlanDto, { ...ok, doseUnit: 'OTHER' })).length).toBeGreaterThan(0);
    expect((await errorsOf(CreatePlanDto, { ...ok, doseUnit: 'OTHER', doseUnitLabel: '' })).length).toBeGreaterThan(0);
    expect((await errorsOf(CreatePlanDto, { ...ok, doseUnit: 'OTHER', doseUnitLabel: 'x'.repeat(21) })).length).toBeGreaterThan(0);
    expect(await errorsOf(CreatePlanDto, { ...ok, doseUnit: 'OTHER', doseUnitLabel: 'x'.repeat(20) })).toHaveLength(0);
  });

  it('dias da semana: obrigatórios em WEEKDAYS (0 a 6, sem repetidos); intervalo de 2 a 90 em EVERY_N_DAYS', async () => {
    const w = { ...ok, scheduleType: 'WEEKDAYS' };
    expect((await errorsOf(CreatePlanDto, w)).length).toBeGreaterThan(0);
    for (const weekdays of [[], [7], [-1], [1, 1], [1.5], ['1']]) expect((await errorsOf(CreatePlanDto, { ...w, weekdays })).length).toBeGreaterThan(0);
    expect(await errorsOf(CreatePlanDto, { ...w, weekdays: [0, 6] })).toHaveLength(0);
    const n = { ...ok, scheduleType: 'EVERY_N_DAYS' };
    for (const intervalDays of [undefined, 1, 91, 2.5, '7']) expect((await errorsOf(CreatePlanDto, { ...n, intervalDays })).length).toBeGreaterThan(0);
    for (const intervalDays of [2, 7, 90]) expect(await errorsOf(CreatePlanDto, { ...n, intervalDays })).toHaveLength(0);
  });

  it('datas, notas, horários e campos fora do contrato', async () => {
    for (const bad of [{ startDate: '01/11/2026' }, { endDate: 'amanhã' }, { notes: 'n'.repeat(281) }, { slots: ['ANY', 'ANY'] }, { slots: ['TARDE'] }, { category: 'DRUG' }, { administration: 'IV' }, { userId: 'x' }, { archivedAt: null }]) {
      expect([bad, (await errorsOf(CreatePlanDto, { ...ok, ...bad })).length > 0]).toEqual([bad, true]);
    }
    expect(await errorsOf(CreatePlanDto, { ...ok, endDate: null, notes: null })).toHaveLength(0);
  });

  it('as mensagens de erro nunca repetem o que foi digitado', async () => {
    const secret = 'Segredo-Nome-123';
    const all = [
      ...(await messages(CreatePlanDto, { ...ok, name: secret + 'x'.repeat(60) })),
      ...(await messages(CreatePlanDto, { ...ok, doseAmount: -12345.678 })),
      ...(await messages(CreatePlanDto, { ...ok, doseUnit: 'OTHER', doseUnitLabel: secret + secret })),
      ...(await messages(CreatePlanDto, { ...ok, notes: secret + 'n'.repeat(300) })),
    ].join(' ');
    expect(all.length).toBeGreaterThan(0);
    expect(all).not.toMatch(/Segredo|12345|-12345/);
  });
});

describe('LogDto e CalendarQueryDto', () => {
  const planId = '11111111-1111-4111-8111-111111111111';
  it('registro: id e data obrigatórios; local, horário e dose opcionais e validados', async () => {
    expect(await errorsOf(LogDto, { planId, date: '2026-11-18' })).toHaveLength(0);
    expect(await errorsOf(LogDto, { planId, date: '2026-11-18', slot: 'MORNING', site: 'THIGH_L', note: 'ok', doseAmount: 0.25, takenAt: '2026-11-18T09:00:00.000Z' })).toHaveLength(0);
    for (const bad of [{ planId: 'x' }, { date: 'hoje' }, { site: 'BRAÇO' }, { slot: 'NOITE' }, { doseAmount: 0 }, { takenAt: 'ontem' }, { userId: 'x' }]) {
      expect((await errorsOf(LogDto, { planId, date: '2026-11-18', ...bad })).length).toBeGreaterThan(0);
    }
  });
  it('calendário: horário HH:MM obrigatório; título generic|name; dose "0" ou "1"', async () => {
    expect(await errorsOf(CalendarQueryDto, { time: '08:30' })).toHaveLength(0);
    expect(await errorsOf(CalendarQueryDto, { time: '23:59', title: 'name', dose: '1' })).toHaveLength(0);
    for (const bad of [{ time: '24:00' }, { time: '8:30' }, { time: '08:60' }, {}, { time: '08:00', title: 'real' }, { time: '08:00', dose: 'sim' }]) {
      expect([bad, (await errorsOf(CalendarQueryDto, bad)).length > 0]).toEqual([bad, true]);
    }
  });
});

describe('PreferencesDto: suplementos', () => {
  it('as duas preferências são booleanas e não aceitam null', async () => {
    expect(await errorsOf(PreferencesDto, { supplementsEnabled: true, supplementsMaskNamesOnHome: false })).toHaveLength(0);
    for (const v of [null, 'sim', 1]) {
      expect((await errorsOf(PreferencesDto, { supplementsEnabled: v })).length).toBeGreaterThan(0);
      expect((await errorsOf(PreferencesDto, { supplementsMaskNamesOnHome: v })).length).toBeGreaterThan(0);
    }
  });
});

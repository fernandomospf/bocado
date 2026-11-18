import { buildIcs, escapeText, firstOccurrence, fold, GENERIC_TITLE, type IcsOptions, type IcsPlan, rruleFor } from './supplements.ics';

const base: IcsPlan = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Ozempic Sensível',
  scheduleType: 'DAILY',
  weekdays: [],
  intervalDays: null,
  startDate: '2026-11-02',
  endDate: null,
  doseAmount: 0.5,
  doseUnit: 'ML',
  doseUnitLabel: null,
};
const now = new Date('2026-11-18T12:00:00Z');
const opts: IcsOptions = { time: '08:30', title: 'generic', includeDose: false, now };
const unfold = (s: string) => s.replace(/\r\n /g, '');

describe('.ics: RRULE dos três tipos', () => {
  it('todo dia', () => expect(rruleFor(base)).toBe('FREQ=DAILY'));
  it('dias da semana: BYDAY na ordem seg a dom', () => {
    expect(rruleFor({ ...base, scheduleType: 'WEEKDAYS', weekdays: [0, 4, 1] })).toBe('FREQ=WEEKLY;BYDAY=MO,TH,SU');
  });
  it('a cada N dias: intervalo fixo', () => expect(rruleFor({ ...base, scheduleType: 'EVERY_N_DAYS', intervalDays: 7 })).toBe('FREQ=DAILY;INTERVAL=7'));
  it('UNTIL no mesmo formato flutuante do início (sem Z), até o fim do último dia', () => {
    expect(rruleFor({ ...base, endDate: '2026-12-31' })).toBe('FREQ=DAILY;UNTIL=20261231T235959');
    expect(rruleFor({ ...base, scheduleType: 'WEEKDAYS', weekdays: [1], endDate: '2026-12-31' })).toBe('FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T235959');
  });
});

describe('.ics: arquivo', () => {
  const file = (over: Partial<IcsPlan> = {}, o = opts) => unfold(buildIcs({ ...base, ...over }, o));

  it('horário flutuante (sem TZID e sem Z), na data de início, com RRULE e alarme no horário do evento', () => {
    const f = file();
    expect(f).toContain('DTSTART:20261102T083000\r\n');
    expect(f).not.toMatch(/TZID|DTSTART[^\r\n]*Z\r\n/);
    expect(f).toContain('RRULE:FREQ=DAILY');
    expect(f).toMatch(/BEGIN:VALARM[\s\S]*TRIGGER:PT0S[\s\S]*END:VALARM/);
    expect(f.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(f.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('dias da semana: o primeiro evento cai num dia listado (início numa segunda, lista só quinta)', () => {
    const f = file({ scheduleType: 'WEEKDAYS', weekdays: [4] });
    expect(f).toContain('DTSTART:20261105T083000');
    expect(firstOccurrence({ scheduleType: 'WEEKDAYS', weekdays: [4], startDate: '2026-11-02' })).toBe('2026-11-05');
    expect(firstOccurrence({ scheduleType: 'DAILY', weekdays: [], startDate: '2026-11-02' })).toBe('2026-11-02');
  });

  it('título genérico por padrão: nem o nome nem a dose aparecem em lugar nenhum do arquivo', () => {
    const f = file();
    expect(f).toContain(`SUMMARY:${GENERIC_TITLE}`);
    expect(f).toContain('DESCRIPTION:Registre no Bocado.');
    expect(f).not.toMatch(/Ozempic|Sens[ií]vel/i);
    expect(f).not.toMatch(/0,5|0\.5|\bml\b/);
  });

  it('nome só com a escolha explícita; a dose só com o opt-in separado', () => {
    expect(file({}, { ...opts, title: 'name' })).toContain('SUMMARY:Ozempic Sensível');
    expect(file({}, { ...opts, title: 'name' })).not.toMatch(/0,5/);
    const withDose = file({}, { ...opts, includeDose: true });
    expect(withDose).toContain(`SUMMARY:${GENERIC_TITLE} · 0\\,5 ml`);
    expect(withDose).not.toMatch(/Ozempic/);
  });

  it('o UID usa só o id do plano (nada do nome) e não há URL, ORGANIZER nem LOCATION', () => {
    const f = file();
    expect(f).toContain(`UID:${base.id}@bocado`);
    expect(f).not.toMatch(/\bURL|ORGANIZER|LOCATION|ATTENDEE|http/i);
  });

  it('escapa vírgula, ponto e vírgula, barra e quebra de linha; dobra linhas longas em 75 octetos', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\;c\\\\d\\ne');
    const long = file({ name: 'Ç'.repeat(80) }, { ...opts, title: 'name' });
    expect(long).toContain('SUMMARY:' + 'Ç'.repeat(80));
    for (const line of buildIcs({ ...base, name: 'Ç'.repeat(80) }, { ...opts, title: 'name' }).split('\r\n')) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    }
    expect(fold('x'.repeat(200)).split('\r\n').every((l) => l.length <= 75)).toBe(true);
  });

  it('com data de fim, o UNTIL entra no arquivo', () => expect(file({ endDate: '2026-12-31' })).toContain('RRULE:FREQ=DAILY;UNTIL=20261231T235959'));
});

import {
  dayBounds,
  effectiveLimit,
  estimateCostUsd,
  isValidTimeZone,
  maskEmail,
  monthBounds,
  parsePrices,
  projectMonthCost,
  zonedMidnightUtc,
} from './quota.math';

const TZ = 'America/Sao_Paulo'; // UTC-3 o ano todo (sem horário de verão desde 2019)
const iso = (d: Date) => d.toISOString();

describe('dayBounds (America/Sao_Paulo)', () => {
  it('23:59:59 local ainda é o mesmo dia; 00:00:00 local já é o seguinte', () => {
    const before = dayBounds(new Date('2026-11-17T02:59:59Z'), TZ); // 23:59:59 de 16/11 em SP
    expect([iso(before.start), iso(before.end)]).toEqual(['2026-11-16T03:00:00.000Z', '2026-11-17T03:00:00.000Z']);
    const after = dayBounds(new Date('2026-11-17T03:00:00Z'), TZ); // 00:00:00 de 17/11 em SP
    expect([iso(after.start), iso(after.end)]).toEqual(['2026-11-17T03:00:00.000Z', '2026-11-18T03:00:00.000Z']);
  });

  it('o fim do dia é exclusivo e igual ao início do próximo', () => {
    const d = dayBounds(new Date('2026-06-10T15:00:00Z'), TZ);
    expect(iso(dayBounds(d.end, TZ).start)).toBe(iso(d.end));
  });

  it('UTC não é o fuso da cota: 01:00Z ainda é "ontem" em São Paulo', () => {
    const b = dayBounds(new Date('2026-11-17T01:00:00Z'), TZ);
    expect(iso(b.start)).toBe('2026-11-16T03:00:00.000Z');
  });
});

describe('monthBounds', () => {
  it('virada de mês no fuso: 23:59:59 de 30/11 em SP é novembro; 00:00 de 01/12 é dezembro', () => {
    const nov = monthBounds(new Date('2026-12-01T02:59:59Z'), TZ);
    expect([iso(nov.start), iso(nov.end)]).toEqual(['2026-11-01T03:00:00.000Z', '2026-12-01T03:00:00.000Z']);
    const dec = monthBounds(new Date('2026-12-01T03:00:00Z'), TZ);
    expect([iso(dec.start), iso(dec.end)]).toEqual(['2026-12-01T03:00:00.000Z', '2027-01-01T03:00:00.000Z']);
  });

  it('virada de ano e fevereiro (ano não bissexto)', () => {
    expect(iso(monthBounds(new Date('2026-12-31T20:00:00Z'), TZ).end)).toBe('2027-01-01T03:00:00.000Z');
    expect(iso(monthBounds(new Date('2026-02-10T12:00:00Z'), TZ).end)).toBe('2026-03-01T03:00:00.000Z');
  });

  it('outro fuso (UTC) também funciona', () => {
    const b = monthBounds(new Date('2026-11-17T12:00:00Z'), 'UTC');
    expect([iso(b.start), iso(b.end)]).toEqual(['2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z']);
  });

  it('fuso com horário de verão: a meia-noite local acompanha o deslocamento', () => {
    expect(iso(zonedMidnightUtc(2026, 7, 1, 'America/New_York'))).toBe('2026-07-01T04:00:00.000Z'); // UTC-4
    expect(iso(zonedMidnightUtc(2026, 1, 1, 'America/New_York'))).toBe('2026-01-01T05:00:00.000Z'); // UTC-5
  });
});

describe('effectiveLimit', () => {
  it('fator 0, 1 e 2', () => {
    expect(effectiveLimit(8, 0)).toBe(0);
    expect(effectiveLimit(8, 1)).toBe(8);
    expect(effectiveLimit(8, 2)).toBe(16);
  });
  it('fator fracionado arredonda para baixo; negativo ou inválido bloqueia', () => {
    expect(effectiveLimit(3, 0.5)).toBe(1);
    expect(effectiveLimit(3, -1)).toBe(0);
    expect(effectiveLimit(3, Number.NaN)).toBe(0);
  });
});

describe('custo', () => {
  const price = { inPerMTok: 3, outPerMTok: 15 };
  it('tokens x preço por milhão', () => {
    expect(estimateCostUsd(1_000_000, 0, price)).toBe(3);
    expect(estimateCostUsd(2000, 500, price)).toBeCloseTo(0.0135, 6);
  });
  it('sem preço configurado, o custo é null (nunca inventado)', () => {
    expect(estimateCostUsd(1000, 1000, undefined)).toBeNull();
  });
  it('projeção linear até o fim do mês', () => {
    const start = new Date('2026-11-01T03:00:00Z');
    const end = new Date('2026-12-01T03:00:00Z');
    const now = new Date('2026-11-11T03:00:00Z'); // 10 de 30 dias
    expect(projectMonthCost(5, now, start, end)).toBeCloseTo(15, 6);
    expect(projectMonthCost(5, start, start, end)).toBeNull();
  });
});

describe('parsePrices', () => {
  it('lê a tabela; vazio = sem preços', () => {
    expect(parsePrices('{"m":{"inPerMTok":1,"outPerMTok":5}}').prices).toEqual({ m: { inPerMTok: 1, outPerMTok: 5 } });
    expect(parsePrices(undefined)).toEqual({ prices: {} });
    expect(parsePrices('  ')).toEqual({ prices: {} });
  });
  it('recusa JSON inválido e preço faltando, sem preencher valores padrão', () => {
    expect(parsePrices('{').error).toMatch(/JSON/);
    expect(parsePrices('[]').error).toBeDefined();
    expect(parsePrices('{"m":{"inPerMTok":1}}').error).toMatch(/"m"/);
    expect(parsePrices('{"m":{"inPerMTok":-1,"outPerMTok":1}}').prices).toEqual({});
  });
});

describe('utilidades', () => {
  it('fuso válido e e-mail mascarado', () => {
    expect(isValidTimeZone('America/Sao_Paulo')).toBe(true);
    expect(isValidTimeZone('Marte/Olympus')).toBe(false);
    expect(maskEmail('fernando@gmail.com')).toBe('f***@gmail.com');
    expect(maskEmail('semarroba')).toBe('***');
  });
});

import { BadRequestException } from '@nestjs/common';
import { dateCell, numCell, row, textCell } from './csv';
import { ExportService } from './export.service';
import { dayBatches, resolvePeriod } from './period';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const NOW = new Date('2026-11-15T15:00:00Z');

async function collect(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

describe('período da exportação', () => {
  it('from = to − (N − 1) dias, para cada período', () => {
    expect(resolvePeriod('7d', '2026-11-15', NOW)).toEqual({ from: '2026-11-09', to: '2026-11-15', days: 7 });
    expect(resolvePeriod('30d', '2026-11-15', NOW).from).toBe('2026-10-17');
    expect(resolvePeriod('365d', '2026-11-15', NOW).from).toBe('2025-11-16');
    expect(resolvePeriod('90d', '2026-03-01', NOW).from).toBe('2025-12-02'); // atravessa o ano
  });

  it('aceita até 1 dia além de hoje (fuso), recusa o futuro e datas inválidas', () => {
    expect(resolvePeriod('7d', '2026-11-16', NOW).to).toBe('2026-11-16');
    expect(() => resolvePeriod('7d', '2026-11-17', NOW)).toThrow(BadRequestException);
    expect(() => resolvePeriod('7d', '2026-13-45', NOW)).toThrow(BadRequestException);
    expect(() => resolvePeriod('2d' as never, '2026-11-15', NOW)).toThrow(BadRequestException);
  });

  it('lotes de até 31 dias cobrem o intervalo sem buracos', () => {
    const batches = [...dayBatches('2025-11-16', '2026-11-15')];
    expect(batches[0]).toEqual(['2025-11-16', '2025-12-16']);
    expect(batches.at(-1)?.[1]).toBe('2026-11-15');
    expect(batches).toHaveLength(12);
    for (let i = 1; i < batches.length; i++) {
      const prevEnd = new Date(`${batches[i - 1][1]}T00:00:00Z`).getTime();
      expect(new Date(`${batches[i][0]}T00:00:00Z`).getTime() - prevEnd).toBe(86_400_000);
    }
  });
});

describe('formato do CSV', () => {
  it('vírgula decimal, datas DD/MM/AAAA, separador ";" e CRLF', () => {
    expect(numCell(12.34)).toBe('12,3');
    expect(numCell(1234.5, 0)).toBe('1235');
    expect(numCell(-0.04)).toBe('0');
    expect(numCell(null)).toBe('');
    expect(dateCell('2026-11-05')).toBe('05/11/2026');
    expect(row(['a', 'b'])).toBe('a;b\r\n');
  });

  it('escape padrão: aspas em volta e aspas internas dobradas', () => {
    expect(textCell('Pão; manteiga')).toBe('"Pão; manteiga"');
    expect(textCell('Bolo "da vó"')).toBe('"Bolo ""da vó"""');
    expect(textCell('linha1\nlinha2')).toBe('"linha1\nlinha2"');
    expect(textCell('Arroz')).toBe('Arroz');
  });

  it('injeção de fórmula: = + - @ e tab ganham um apóstrofo', () => {
    expect(textCell('=HYPERLINK("http://x")')).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(textCell('+5')).toBe("'+5");
    expect(textCell('-cmd')).toBe("'-cmd");
    expect(textCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(textCell('\tx')).toBe("'\tx");
  });
});

function setup() {
  const prisma = {
    meal: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    mealItem: { count: jest.fn().mockResolvedValue(0) },
    weightEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    workout: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    waterEntry: { count: jest.fn().mockResolvedValue(0), groupBy: jest.fn().mockResolvedValue([]) },
    waterDay: { findMany: jest.fn().mockResolvedValue([]) },
    profile: { findUnique: jest.fn().mockResolvedValue({ kcalTarget: 2000 }) },
  };
  return { prisma, service: new ExportService(prisma as never) };
}

const item = (name: string, kcal: number, extra: object = {}) => ({
  id: name, mealId: 'm', name, grams: 100, kcal, protein: 10.25, carbs: 20, fat: 5, estimated: false, ...extra,
});

describe('ExportService.mealsCsv', () => {
  it('BOM, cabeçalho, ordem Café/Almoço/Lanche/Jantar, origem, estimativa e totais por dia', async () => {
    const { prisma, service } = setup();
    prisma.meal.findMany.mockResolvedValueOnce([
      { id: '1', date: day('2026-11-14'), type: 'DINNER', source: 'PHOTO', createdAt: new Date(1), items: [item('Sopa', 300, { estimated: true })] },
      { id: '2', date: day('2026-11-14'), type: 'BREAKFAST', source: 'SEARCH', createdAt: new Date(2), items: [item('Pão', 150)] },
      { id: '3', date: day('2026-11-15'), type: 'SNACK', source: 'MANUAL', createdAt: new Date(3), items: [item('=1+1', 99.6)] },
    ]);
    const csv = await collect(service.mealsCsv('user-1', '2026-11-09', '2026-11-15'));
    const lines = csv.split('\r\n');

    expect(csv.startsWith('﻿Data;Refeição;Alimento;Gramas;Kcal;Proteína (g);Carboidratos (g);Gorduras (g);Origem;Estimativa\r\n')).toBe(true);
    expect(lines[1]).toBe('14/11/2026;Café da manhã;Pão;100;150;10,3;20;5;Busca;não');
    expect(lines[2]).toBe('14/11/2026;Jantar;Sopa;100;300;10,3;20;5;Foto;sim');
    expect(lines[3]).toBe("15/11/2026;Lanche;'=1+1;100;100;10,3;20;5;Manual;não");
    expect(lines[4]).toBe('');
    expect(lines[5]).toBe('Totais por dia');
    expect(lines[6]).toBe('Data;Kcal;Proteína (g);Carboidratos (g);Gorduras (g);Meta de kcal');
    expect(lines[7]).toBe('14/11/2026;450;20,5;40;10;2000');
    expect(lines[8]).toBe('15/11/2026;100;10,3;20;5;2000');
  });

  it('busca em lotes e sempre filtrando pelo usuário da sessão', async () => {
    const { prisma, service } = setup();
    await collect(service.mealsCsv('user-1', '2025-11-16', '2026-11-15'));
    expect(prisma.meal.findMany).toHaveBeenCalledTimes(12);
    for (const [args] of prisma.meal.findMany.mock.calls) expect(args.where.userId).toBe('user-1');
  });

  it('período sem dados: só o cabeçalho', async () => {
    const { service } = setup();
    const csv = await collect(service.mealsCsv('user-1', '2026-11-09', '2026-11-15'));
    expect(csv.split('\r\n')).toEqual(['﻿Data;Refeição;Alimento;Gramas;Kcal;Proteína (g);Carboidratos (g);Gorduras (g);Origem;Estimativa', '']);
  });
});

describe('ExportService.weightCsv', () => {
  it('média de 7 dias usa os dias anteriores ao período, e a variação usa a média (primeira × última)', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.findMany.mockResolvedValue([
      { date: day('2026-11-05'), weightKg: 80, note: null }, // antes do período: só entra na média
      { date: day('2026-11-09'), weightKg: 79, note: 'Depois da festa; inchado' },
      { date: day('2026-11-15'), weightKg: 78, note: null },
    ]);
    const csv = await collect(service.weightCsv('user-1', '2026-11-09', '2026-11-15'));
    const lines = csv.split('\r\n');
    expect(prisma.weightEntry.findMany.mock.calls[0][0].where).toEqual({
      userId: 'user-1',
      date: { gte: day('2026-11-03'), lte: day('2026-11-15') },
    });
    expect(lines[0]).toBe('﻿Data;Peso (kg);Média de 7 dias (kg);Nota');
    expect(lines[1]).toBe('09/11/2026;79;79,5;"Depois da festa; inchado"');
    expect(lines[2]).toBe('15/11/2026;78;78,5;');
    expect(lines[4]).toBe('Variação no período (kg);-1');
  });

  it('com um registro só, sem a linha de variação', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.findMany.mockResolvedValue([{ date: day('2026-11-15'), weightKg: 78, note: null }]);
    const csv = await collect(service.weightCsv('user-1', '2026-11-09', '2026-11-15'));
    expect(csv).not.toContain('Variação');
  });
});

describe('ExportService.summary', () => {
  it('conta só os registros do usuário no período', async () => {
    const { prisma, service } = setup();
    prisma.meal.count.mockResolvedValue(3);
    await service.summary('user-1', '2026-11-09', '2026-11-15');
    const range = { gte: day('2026-11-09'), lte: day('2026-11-15') };
    expect(prisma.meal.count).toHaveBeenCalledWith({ where: { userId: 'user-1', date: range } });
    expect(prisma.mealItem.count).toHaveBeenCalledWith({ where: { meal: { userId: 'user-1', date: range } } });
    expect(prisma.weightEntry.count).toHaveBeenCalledWith({ where: { userId: 'user-1', date: range } });
  });
});

describe('treinos em CSV', () => {
  const w = (over: object = {}) => ({
    date: day('2026-11-10'),
    type: 'STRENGTH',
    intensity: 'MODERATE',
    durationMin: 60,
    note: '=cmd',
    createdAt: new Date(),
    ...over,
  });

  it('sem a estimativa ligada: sem a coluna de gasto', async () => {
    const { service, prisma } = setup();
    prisma.profile.findUnique.mockResolvedValue({ weightKg: 70, workoutEstimateEnabled: false });
    prisma.workout.findMany.mockResolvedValue([w()]);
    const out = await collect(service.workoutsCsv('user-1', '2026-11-01', '2026-11-15'));
    expect(out).toContain('Data;Tipo;Duração (min);Intensidade;Nota\r\n');
    expect(out).not.toContain('Gasto estimado');
    expect(out).toContain("10/11/2026;Musculação;60;Moderada;'=cmd\r\n"); // injeção de fórmula neutralizada
  });

  it('com a estimativa ligada: coluna extra, líquida e arredondada', async () => {
    const { service, prisma } = setup();
    prisma.profile.findUnique.mockResolvedValue({ weightKg: 70, workoutEstimateEnabled: true });
    prisma.workout.findMany.mockResolvedValue([w({ note: null })]);
    const out = await collect(service.workoutsCsv('user-1', '2026-11-01', '2026-11-15'));
    expect(out).toContain('Gasto estimado (kcal)');
    expect(out).toContain('10/11/2026;Musculação;60;Moderada;;280');
  });

  it('só os treinos do usuário da sessão, no período, e o resumo conta os treinos', async () => {
    const { service, prisma } = setup();
    await collect(service.workoutsCsv('user-1', '2026-11-01', '2026-11-15'));
    expect(prisma.workout.findMany.mock.calls[0][0].where.userId).toBe('user-1');
    prisma.workout.count.mockResolvedValue(4);
    expect(await service.summary('user-1', '2026-11-01', '2026-11-15')).toMatchObject({ workouts: 4 });
    expect(prisma.workout.count.mock.calls[0][0].where.userId).toBe('user-1');
  });
});

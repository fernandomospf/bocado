import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ImportWeightDto } from './dto/weight.dto';
import { normalizeImport } from './weight-import';

const MAX = '2026-11-20';

describe('normalizeImport', () => {
  it('um registro por dia: vários no mesmo dia viram a MÉDIA (1 casa)', () => {
    const { entries } = normalizeImport(
      [
        { date: '2026-11-10', weightKg: 80.0 },
        { date: '2026-11-10', weightKg: 81.0 },
        { date: '2026-11-10', weightKg: 80.4 },
        { date: '2026-11-09', weightKg: 79.94 },
      ],
      MAX,
    );
    expect(entries).toEqual([
      { date: '2026-11-09', weightKg: 79.9 },
      { date: '2026-11-10', weightKg: 80.5 },
    ]);
  });

  it('descarta fora de 30 a 350 kg, datas futuras, anteriores a 1950 e inválidas, contando cada motivo', () => {
    const { entries, discarded } = normalizeImport(
      [
        { date: '2026-11-10', weightKg: 29.9 },
        { date: '2026-11-10', weightKg: 350.1 },
        { date: '2026-11-10', weightKg: 30 },
        { date: '2026-11-11', weightKg: 350 },
        { date: '2026-11-21', weightKg: 80 },
        { date: '1949-12-31', weightKg: 80 },
        { date: '2026-02-30', weightKg: 80 },
        { date: '2026-11-12', weightKg: Number.NaN },
      ],
      MAX,
    );
    expect(entries.map((e) => e.weightKg)).toEqual([30, 350]);
    expect(discarded).toEqual({ invalidDate: 1, futureDate: 1, beforeMin: 1, outOfRange: 3 });
  });

  it('aceita o limite de 1950-01-01 e o último dia permitido', () => {
    const { entries } = normalizeImport([{ date: '1950-01-01', weightKg: 70 }, { date: MAX, weightKg: 71 }], MAX);
    expect(entries).toHaveLength(2);
  });
});

describe('ImportWeightDto', () => {
  const check = (raw: unknown) => validate(plainToInstance(ImportWeightDto, raw));
  const base = { source: 'CSV', conflict: 'keep', entries: [{ date: '2026-11-10', weightKg: 80 }] };
  it('aceita um lote válido', async () => {
    expect(await check(base)).toHaveLength(0);
    expect(await check({ ...base, source: 'APPLE_HEALTH', conflict: 'replace' })).toHaveLength(0);
  });
  it('limita a 5.000 entradas por envio e exige ao menos uma', async () => {
    const many = (n: number) => Array.from({ length: n }, () => ({ date: '2026-11-10', weightKg: 80 }));
    expect(await check({ ...base, entries: many(5000) })).toHaveLength(0);
    expect(await check({ ...base, entries: many(5001) })).not.toHaveLength(0);
    expect(await check({ ...base, entries: [] })).not.toHaveLength(0);
  });
  it('recusa origem, estratégia, data e importId inválidos', async () => {
    expect(await check({ ...base, source: 'XLS' })).not.toHaveLength(0);
    expect(await check({ ...base, conflict: 'merge' })).not.toHaveLength(0);
    expect(await check({ ...base, entries: [{ date: '10/11/2026', weightKg: 80 }] })).not.toHaveLength(0);
    expect(await check({ ...base, importId: 'abc' })).not.toHaveLength(0);
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException, HttpStatus } from '@nestjs/common';
import { FoodSource, GoalType } from '@prisma/client';
import { cacheKey, CLOSE_DAY_AI, SuggestionsService } from './suggestions.service';

const USER = 'user-1';
const DATE = new Date().toISOString().slice(0, 10);

const profile = { kcalTarget: 2100, proteinTarget: 150, carbsTarget: 220, fatTarget: 70, goal: GoalType.LOSE };
/** Consumido até agora: faltam 806 kcal e 48 g de proteína (o caso real relatado). */
const eaten = { kcal: 1294, protein: 102, carbs: 125, fat: 45 };

// TACO real (mesmo arquivo do seed), servida pelo mock do Prisma
const taco = (
  JSON.parse(readFileSync(join(__dirname, '../../prisma/data/taco.json'), 'utf8')) as {
    name: string;
    category: string;
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  }[]
).map((t, i) => {
  const isBean = t.name.startsWith('Feijão') && t.name.endsWith('cozido');
  const isRice = t.name === 'Arroz, tipo 1, cozido';
  return {
    id: `t${i}`,
    name: t.name,
    displayName: null,
    category: t.category,
    source: FoodSource.TACO,
    kcal100: t.kcal,
    protein100: t.protein,
    carbs100: t.carbs,
    fat100: t.fat,
    portionGrams: isBean ? 86 : isRice ? 125 : null,
    portionLabel: isBean ? '1 concha' : isRice ? '1 escumadeira' : null,
  };
});

const aiAnswer = {
  suggestions: [
    {
      title: 'Omelete com arroz',
      items: [
        { name: 'Ovos', grams: 200, kcal: 290, protein: 26, carbs: 1, fat: 20 },
        { name: 'Arroz cozido', grams: 250, kcal: 320, protein: 6, carbs: 70, fat: 0.5 },
        { name: 'Peito de frango', grams: 60, kcal: 95, protein: 19, carbs: 0, fat: 1.5 },
      ],
      steps: ['Bata os ovos', 'Faça a omelete', 'Sirva'],
      minutes: 15,
    },
  ],
};

interface SetupOptions {
  templatesAvailable?: boolean;
  historyMeals?: unknown[];
  usageCount?: number;
  search?: jest.Mock;
}

function setup({ templatesAvailable = true, historyMeals = [], usageCount = 0, search }: SetupOptions = {}) {
  const prisma = {
    profile: { findUnique: jest.fn().mockResolvedValue(profile) },
    mealItem: { aggregate: jest.fn().mockResolvedValue({ _sum: eaten }) },
    meal: { findMany: jest.fn().mockResolvedValue(historyMeals) },
    food: {
      findMany: jest.fn().mockImplementation(({ where, select }: { where: { name?: { in: string[] } }; select?: unknown }) => {
        if (select) return Promise.resolve(taco.map((t) => ({ name: t.name })));
        if (!templatesAvailable) return Promise.resolve([]);
        const names = where.name?.in;
        return Promise.resolve(names ? taco.filter((t) => names.includes(t.name)) : taco);
      }),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
    suggestionCache: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), upsert: jest.fn() },
    aiUsage: {
      findUnique: jest.fn().mockResolvedValue(usageCount ? { count: usageCount } : null),
      upsert: jest.fn().mockImplementation(() => Promise.resolve({ count: usageCount + 1 })),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const analysis = { isConfigured: true, callTool: jest.fn().mockResolvedValue(aiAnswer) };
  const foods = { search: search ?? jest.fn().mockResolvedValue([]) };
  const meals = { create: jest.fn() };
  return {
    prisma,
    analysis,
    foods,
    service: new SuggestionsService(prisma as never, foods as never, analysis as never, meals as never),
  };
}

describe('closeDay (só local)', () => {
  it('quando o local resolve, a IA NÃO é chamada nem oferecida', async () => {
    const { analysis, service } = setup();
    const out = await service.closeDay(USER, DATE, 'DINNER');
    expect(out.remaining).toEqual({ kcal: 806, protein: 48, carbs: 95, fat: 25 });
    expect(out.source).toBe('local');
    expect(out.suggestions.some((s) => s.good)).toBe(true);
    expect(out.canAskAi).toBe(false);
    expect(analysis.callTool).not.toHaveBeenCalled();
    for (const s of out.suggestions) expect(s.totals.protein).toBeGreaterThanOrEqual(41);
  });

  it('modelos de pratos vêm com nomes naturais e o selo de origem "template"', async () => {
    const { service } = setup();
    const out = await service.closeDay(USER, DATE, 'DINNER');
    expect(out.suggestions[0].mainOrigin).toBe('template');
    expect(out.suggestions[0].items[0].name).not.toMatch(/,/);
  });

  it('o histórico do mesmo tipo de refeição vem primeiro, escalado', async () => {
    const meal = {
      items: [
        { name: 'Frango, peito, sem pele, grelhado', grams: 150, kcal: 239, protein: 48, carbs: 0, fat: 3.8 },
        { name: 'Arroz, tipo 1, cozido', grams: 250, kcal: 321, protein: 6.3, carbs: 70.3, fat: 0.5 },
        { name: 'Feijão, carioca, cozido', grams: 86, kcal: 66, protein: 4.1, carbs: 11.7, fat: 0.4 },
      ],
    };
    const { prisma, service } = setup({ historyMeals: [meal, meal, meal] });
    const out = await service.closeDay(USER, DATE, 'DINNER');
    expect(prisma.meal.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: 'DINNER' }) }));
    expect(out.suggestions[0].mainOrigin).toBe('history');
    expect(out.suggestions[0].items[0].name).toBe('Peito de frango grelhado'); // nome antigo da TACO formatado
  });

  it('sem nenhuma opção boa, devolve o que houver e oferece a IA (sem chamá-la)', async () => {
    const { analysis, service } = setup({ templatesAvailable: false });
    const out = await service.closeDay(USER, DATE, 'DINNER');
    expect(out.suggestions).toEqual([]);
    expect(out.canAskAi).toBe(true);
    expect(analysis.callTool).not.toHaveBeenCalled();
  });

  it('dia fechado: não sugere comer mais', async () => {
    const { prisma, service } = setup();
    prisma.mealItem.aggregate.mockResolvedValue({ _sum: { kcal: 2050, protein: 140, carbs: 210, fat: 68 } });
    const out = await service.closeDay(USER, DATE, 'DINNER');
    expect(out).toMatchObject({ closed: true, suggestions: [], source: 'none', canAskAi: false });
  });
});

describe('closeDayFromPantry', () => {
  it('"frango, 2 ovos e arroz": reconhece os 3 e só usa esses ingredientes (+ salada genérica)', async () => {
    const { service } = setup();
    const out = await service.closeDayFromPantry(USER, DATE, 'DINNER', 'frango, 2 ovos e arroz');
    expect(out.pantry?.recognized.map((r) => r.name)).toEqual(['Peito de frango grelhado', 'Ovo cozido', 'Arroz branco cozido']);
    const allowed = new Set(['Peito de frango grelhado', 'Ovo cozido', 'Arroz branco cozido', 'Alface crespa', 'Tomate']);
    expect(out.suggestions.length).toBeGreaterThan(0);
    for (const s of out.suggestions) for (const i of s.items) expect(allowed.has(i.name)).toBe(true);
  });

  it('o que a pessoa já registrou tem prioridade sobre o mapa', async () => {
    const search = jest.fn().mockResolvedValue([
      {
        name: 'Frango desfiado da casa',
        origin: 'history',
        per100: { kcal: 170, protein: 30, carbs: 0, fat: 5 },
        portion: { grams: 120, label: 'última porção' },
      },
    ]);
    const { service } = setup({ search });
    const out = await service.closeDayFromPantry(USER, DATE, 'DINNER', 'frango desfiado');
    expect(out.pantry?.recognized[0].name).toBe('Frango desfiado da casa');
  });

  it('termo não reconhecido (ou macarrão, que a TACO não tem cozido) → oferece a IA', async () => {
    const { service } = setup();
    const out = await service.closeDayFromPantry(USER, DATE, 'DINNER', 'xyzabc e macarrão');
    expect(out.pantry?.unknown).toEqual(['xyzabc', 'macarrão']);
    expect(out.canAskAi).toBe(true);
  });
});

describe('closeDayWithAi', () => {
  it('cache miss: chama a IA uma vez, valida os totais, grava no cache e conta no limite', async () => {
    const { prisma, analysis, service } = setup({ templatesAvailable: false });
    const out = await service.closeDayWithAi(USER, DATE, 'DINNER');
    expect(analysis.callTool).toHaveBeenCalledTimes(1);
    expect(out.source).toBe('ai');
    expect(out.suggestions[0].totals).toEqual({ kcal: 705, protein: 51, carbs: 71, fat: 22 });
    expect(out.suggestions[0].items[0].label).toBe('200 g Ovos');
    expect(prisma.aiUsage.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.suggestionCache.upsert).toHaveBeenCalledTimes(1);
  });

  it('com despensa: a IA recebe "use só estes ingredientes" e a chave do cache muda', async () => {
    const { prisma, analysis, service } = setup();
    await service.closeDayWithAi(USER, DATE, 'DINNER', ['Frango', 'arroz']);
    const text = analysis.callTool.mock.calls[0][0].content[0].text as string;
    expect(text).toMatch(/Use SÓ estes ingredientes.*arroz, frango/);
    const key = prisma.suggestionCache.findUnique.mock.calls[0][0].where.key;
    const target = { kcal: 806, protein: 48, carbs: 95, fat: 25 };
    expect(key).not.toBe(cacheKey(target, 'DINNER', GoalType.LOSE));
    expect(key).toBe(cacheKey(target, 'DINNER', GoalType.LOSE, ['arroz', 'frango']));
  });

  it('cache hit: não chama a IA e não conta no limite', async () => {
    const { prisma, analysis, service } = setup();
    prisma.suggestionCache.findUnique.mockResolvedValue({
      key: 'k',
      createdAt: new Date(),
      result: [
        { title: 'Do cache', items: [], totals: { kcal: 800, protein: 47, carbs: 90, fat: 25 }, origin: 'ai', mainOrigin: 'ai', fit: 0, good: false },
      ],
    });
    const out = await service.closeDayWithAi(USER, DATE, 'DINNER');
    expect(analysis.callTool).not.toHaveBeenCalled();
    expect(prisma.aiUsage.upsert).not.toHaveBeenCalled();
    expect(out.suggestions[0]).toMatchObject({ title: 'Do cache', good: true }); // recalculado para este alvo
  });

  it('limite diário: a 4ª chamada é recusada (429) sem chamar a IA, e a reserva é desfeita', async () => {
    const { prisma, analysis, service } = setup({ usageCount: CLOSE_DAY_AI.dailyLimit });
    const err = await service.closeDayWithAi(USER, DATE, 'DINNER').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(analysis.callTool).not.toHaveBeenCalled();
    expect(prisma.aiUsage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { count: { decrement: 1 } } }));
  });

  it('falha da IA devolve a chamada ao limite', async () => {
    const { prisma, analysis, service } = setup();
    analysis.callTool.mockRejectedValue(new Error('rede'));
    await expect(service.closeDayWithAi(USER, DATE, 'DINNER')).rejects.toThrow('rede');
    expect(prisma.aiUsage.updateMany).toHaveBeenCalled();
  });
});

describe('cacheKey', () => {
  const rem = { kcal: 620, protein: 48, carbs: 60, fat: 15 };
  it('déficits parecidos compartilham a chave; ingredientes normalizados e sem ordem', () => {
    expect(cacheKey(rem, 'DINNER', GoalType.LOSE)).toBe(cacheKey({ kcal: 610, protein: 49, carbs: 61, fat: 16 }, 'DINNER', GoalType.LOSE));
    expect(cacheKey(rem, 'DINNER', GoalType.LOSE, ['Frango', 'Arroz'])).toBe(cacheKey(rem, 'DINNER', GoalType.LOSE, ['arroz', 'frango']));
  });

  it('refeição, objetivo, déficit ou ingredientes diferentes mudam a chave', () => {
    const k = cacheKey(rem, 'DINNER', GoalType.LOSE);
    expect(cacheKey(rem, 'SNACK', GoalType.LOSE)).not.toBe(k);
    expect(cacheKey(rem, 'DINNER', GoalType.GAIN)).not.toBe(k);
    expect(cacheKey({ ...rem, kcal: 700 }, 'DINNER', GoalType.LOSE)).not.toBe(k);
    expect(cacheKey(rem, 'DINNER', GoalType.LOSE, ['frango'])).not.toBe(k);
  });
});

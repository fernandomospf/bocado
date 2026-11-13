import { HttpException, HttpStatus } from '@nestjs/common';
import { FoodSource, GoalType } from '@prisma/client';
import { cacheKey, CLOSE_DAY_AI, SuggestionsService } from './suggestions.service';

const USER = 'user-1';
const DATE = new Date().toISOString().slice(0, 10);

const profile = { kcalTarget: 2100, proteinTarget: 150, carbsTarget: 220, fatTarget: 70, goal: GoalType.LOSE };
/** Consumido até agora: faltam 620 kcal, 48 g de proteína, 60 g de carboidratos e 15 g de gordura. */
const eaten = { kcal: 1480, protein: 102, carbs: 160, fat: 55 };

const food = (id: string, name: string, category: string, kcal: number, protein: number, carbs: number, fat: number) => ({
  id,
  name,
  category,
  source: FoodSource.TACO,
  kcal100: kcal,
  protein100: protein,
  carbs100: carbs,
  fat100: fat,
  portionGrams: null,
});

const TACO_GOOD = [
  food('1', 'Frango, peito, sem pele, grelhado', 'Carnes e derivados', 159, 32, 0, 2.5),
  food('2', 'Carne, bovina, acém, moído, cozido', 'Carnes e derivados', 212, 26.7, 0, 10.9),
  food('3', 'Arroz, tipo 1, cozido', 'Cereais e derivados', 128, 2.5, 28.1, 0.2),
  food('4', 'Alface, crespa, crua', 'Verduras, hortaliças e derivados', 11, 1.3, 1.7, 0.2),
];
/** Só verdura: nenhuma combinação local chega perto do que falta. */
const TACO_WEAK = [food('4', 'Alface, crespa, crua', 'Verduras, hortaliças e derivados', 11, 1.3, 1.7, 0.2)];

const aiAnswer = {
  suggestions: [
    {
      title: 'Omelete com arroz',
      items: [
        { name: 'Ovos', grams: 150, kcal: 215, protein: 19, carbs: 1, fat: 15 },
        { name: 'Arroz cozido', grams: 200, kcal: 256, protein: 5, carbs: 56, fat: 0.4 },
        { name: 'Peito de frango', grams: 80, kcal: 127, protein: 25.6, carbs: 0, fat: 2 },
      ],
      steps: ['Bata os ovos', 'Faça a omelete', 'Sirva'],
      minutes: 15,
    },
  ],
};

function setup(taco = TACO_GOOD, usageCount = 0) {
  const prisma = {
    profile: { findUnique: jest.fn().mockResolvedValue(profile) },
    mealItem: { aggregate: jest.fn().mockResolvedValue({ _sum: eaten }) },
    food: { findMany: jest.fn().mockResolvedValue(taco) },
    $queryRaw: jest.fn().mockResolvedValue([]), // sem histórico
    suggestionCache: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), upsert: jest.fn() },
    aiUsage: {
      findUnique: jest.fn().mockResolvedValue(usageCount ? { count: usageCount } : null),
      upsert: jest.fn().mockImplementation(() => Promise.resolve({ count: usageCount + 1 })),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const analysis = { isConfigured: true, callTool: jest.fn().mockResolvedValue(aiAnswer) };
  const recipes = { list: jest.fn().mockResolvedValue([]) };
  const meals = { create: jest.fn() };
  return { prisma, analysis, service: new SuggestionsService(prisma as never, recipes as never, analysis as never, meals as never) };
}

describe('SuggestionsService.closeDay (só local)', () => {
  it('quando o local resolve, a IA NÃO é chamada nem oferecida', async () => {
    const { analysis, service } = setup(TACO_GOOD);
    const out = await service.closeDay(USER, DATE);
    expect(out.remaining).toEqual({ kcal: 620, protein: 48, carbs: 60, fat: 15 });
    expect(out.source).toBe('local');
    expect(out.suggestions.some((s) => s.good)).toBe(true);
    expect(out.canAskAi).toBe(false);
    expect(analysis.callTool).not.toHaveBeenCalled();
  });

  it('quando o local não é bom o suficiente, devolve o melhor local e oferece a IA (sem chamá-la)', async () => {
    const { analysis, service } = setup(TACO_WEAK);
    const out = await service.closeDay(USER, DATE);
    expect(out.canAskAi).toBe(true);
    expect(out.aiRemaining).toBe(CLOSE_DAY_AI.dailyLimit);
    expect(analysis.callTool).not.toHaveBeenCalled();
  });

  it('com muito a fazer (nada registrado), a refeição mira 40% da meta, não o dia inteiro', async () => {
    const { prisma, service } = setup(TACO_GOOD);
    prisma.mealItem.aggregate.mockResolvedValue({ _sum: { kcal: null, protein: null, carbs: null, fat: null } });
    const out = await service.closeDay(USER, DATE);
    expect(out.remaining?.kcal).toBe(2100);
    expect(out.target?.kcal).toBe(840);
    expect(Math.max(...out.suggestions.map((s) => s.totals.kcal))).toBeLessThanOrEqual(840 * 1.1);
  });

  it('dia fechado: não sugere comer mais', async () => {
    const { prisma, service } = setup();
    prisma.mealItem.aggregate.mockResolvedValue({ _sum: { kcal: 2050, protein: 140, carbs: 210, fat: 68 } });
    const out = await service.closeDay(USER, DATE);
    expect(out).toMatchObject({ closed: true, suggestions: [], source: 'none', canAskAi: false });
  });

  it('sem IA restante no dia, não oferece', async () => {
    const { service } = setup(TACO_WEAK, CLOSE_DAY_AI.dailyLimit);
    expect((await service.closeDay(USER, DATE)).canAskAi).toBe(false);
  });
});

describe('SuggestionsService.closeDayWithAi', () => {
  it('cache miss: chama a IA uma vez, valida os totais, grava no cache e conta no limite', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK);
    const out = await service.closeDayWithAi(USER, DATE, 'DINNER');
    expect(analysis.callTool).toHaveBeenCalledTimes(1);
    expect(out.source).toBe('ai');
    expect(out.suggestions[0].totals).toEqual({ kcal: 598, protein: 49.6, carbs: 57, fat: 17.4 });
    expect(out.suggestions[0].good).toBe(true);
    expect(prisma.aiUsage.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.suggestionCache.upsert).toHaveBeenCalledTimes(1);
    expect(out.aiRemaining).toBe(CLOSE_DAY_AI.dailyLimit - 1);
  });

  it('cache hit: não chama a IA e não conta no limite', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK);
    prisma.suggestionCache.findUnique.mockResolvedValue({
      key: 'k',
      createdAt: new Date(),
      result: [{ title: 'Do cache', items: [], totals: { kcal: 610, protein: 47, carbs: 58, fat: 16 }, origin: 'ai', mainOrigin: 'ai', fit: 0, good: false }],
    });
    const out = await service.closeDayWithAi(USER, DATE, 'DINNER');
    expect(analysis.callTool).not.toHaveBeenCalled();
    expect(prisma.aiUsage.upsert).not.toHaveBeenCalled();
    expect(prisma.suggestionCache.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ hits: { increment: 1 } }) }));
    expect(out.suggestions[0]).toMatchObject({ title: 'Do cache', good: true }); // fit/good recalculados
  });

  it('cache vencido (> 30 dias) conta como miss', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK);
    prisma.suggestionCache.findUnique.mockResolvedValue({ key: 'k', createdAt: new Date(Date.now() - CLOSE_DAY_AI.cacheTtlMs - 1), result: [] });
    await service.closeDayWithAi(USER, DATE, 'DINNER');
    expect(analysis.callTool).toHaveBeenCalledTimes(1);
  });

  it('limite diário: a 4ª chamada no dia é recusada (429) sem chamar a IA, e a reserva é desfeita', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK, CLOSE_DAY_AI.dailyLimit);
    const err = await service.closeDayWithAi(USER, DATE, 'DINNER').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(analysis.callTool).not.toHaveBeenCalled();
    expect(prisma.aiUsage.update).toHaveBeenCalledWith(expect.objectContaining({ data: { count: { decrement: 1 } } }));
  });

  it('falha da IA devolve a chamada ao limite', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK);
    analysis.callTool.mockRejectedValue(new Error('rede'));
    await expect(service.closeDayWithAi(USER, DATE, 'DINNER')).rejects.toThrow('rede');
    expect(prisma.aiUsage.updateMany).toHaveBeenCalled();
    expect(prisma.suggestionCache.upsert).not.toHaveBeenCalled();
  });

  it('o prompt leva só nomes genéricos da TACO (o cache é compartilhado entre usuários)', async () => {
    const { prisma, analysis, service } = setup(TACO_WEAK);
    prisma.food.findMany.mockResolvedValue([...TACO_GOOD, food('9', 'Ovo, de galinha, inteiro, cozido/10minutos', 'Ovos e derivados', 146, 13.3, 0.6, 9.5)]);
    prisma.$queryRaw.mockResolvedValue([
      { norm: 'ovos mexidos', name: 'Ovos mexidos', grams: 110, kcal: 185, protein: 12.5, carbs: 1.5, fat: 14, times: BigInt(9) },
      { norm: 'bolo da tia maria', name: 'Bolo da tia Maria', grams: 80, kcal: 300, protein: 4, carbs: 45, fat: 12, times: BigInt(3) },
    ]);
    await service.closeDayWithAi(USER, DATE, 'DINNER');
    const text = analysis.callTool.mock.calls[0][0].content[0].text as string;
    expect(text).toContain('ovo');
    expect(text).not.toMatch(/tia maria/i);
  });
});

describe('cacheKey', () => {
  const rem = { kcal: 620, protein: 48, carbs: 60, fat: 15 };
  it('déficits parecidos (arredondados a 50 kcal e 5 g) compartilham a mesma chave', () => {
    expect(cacheKey(rem, 'DINNER', GoalType.LOSE)).toBe(cacheKey({ kcal: 610, protein: 49, carbs: 61, fat: 16 }, 'DINNER', GoalType.LOSE));
  });
  it('refeição, objetivo ou déficit diferente mudam a chave', () => {
    const k = cacheKey(rem, 'DINNER', GoalType.LOSE);
    expect(cacheKey(rem, 'SNACK', GoalType.LOSE)).not.toBe(k);
    expect(cacheKey(rem, 'DINNER', GoalType.GAIN)).not.toBe(k);
    expect(cacheKey({ ...rem, kcal: 700 }, 'DINNER', GoalType.LOSE)).not.toBe(k);
  });
});

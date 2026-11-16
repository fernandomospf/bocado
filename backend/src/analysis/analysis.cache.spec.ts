import { ConfigService } from '@nestjs/config';
import { ANALYSIS_CACHE_TTL_MS, AnalysisCacheService } from './analysis.cache';
import { analysisCacheKey, normalizeDescription } from './analysis.normalize';
import { PROMPT_VERSION } from './analysis.prompt';
import { AnalysisService } from './analysis.service';

describe('normalizeDescription', () => {
  it('minúsculas, sem acentos e espaços colapsados', () => {
    expect(normalizeDescription('  Café   COM  Pão  Francês ')).toBe('cafe com pao frances');
  });

  it('tira a pontuação do fim, mas não a do meio', () => {
    expect(normalizeDescription('arroz, feijão e bife!!!')).toBe('arroz, feijao e bife');
    expect(normalizeDescription('1,5 xícara de café.')).toBe('1,5 xicara de cafe');
  });

  it.each([
    ['duas fatias de pão', '2 fatias de pao'],
    ['uma banana', '1 banana'],
    ['Três ovos e dez uvas', '3 ovos e 10 uvas'],
  ])('números por extenso viram dígitos: %s', (input, expected) => {
    expect(normalizeDescription(input)).toBe(expected);
  });

  it('"duas" e "2" dão a mesma chave; palavras que só contêm um número não mudam', () => {
    expect(analysisCacheKey('Duas fatias de pão.', 'm')).toBe(analysisCacheKey('2 fatias de pao', 'm'));
    expect(normalizeDescription('umbigo de boi, sete-cuecas')).toBe('umbigo de boi, 7-cuecas');
  });
});

describe('analysisCacheKey', () => {
  it('é um sha256 e muda com o modelo e com a versão do prompt', () => {
    const base = analysisCacheKey('2 ovos', 'modelo-a', 1);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(analysisCacheKey('2 ovos', 'modelo-b', 1)).not.toBe(base);
    expect(analysisCacheKey('2 ovos', 'modelo-a', 2)).not.toBe(base);
    expect(analysisCacheKey('2 ovos', 'modelo-a')).toBe(analysisCacheKey('2 ovos', 'modelo-a', PROMPT_VERSION));
  });
});

// ---------------------------------------------------------------------------

type Row = { key: string; result: unknown; hits: number; createdAt: Date; lastHitAt: Date | null };

/** Prisma falso em memória, só com o que o cache usa. */
function fakePrisma() {
  const rows = new Map<string, Row>();
  const analysisCache = {
    findUnique: jest.fn(async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null),
    update: jest.fn(async ({ where, data }: { where: { key: string }; data: { hits: { increment: number }; lastHitAt: Date } }) => {
      const r = rows.get(where.key)!;
      r.hits += data.hits.increment;
      r.lastHitAt = data.lastHitAt;
      return r;
    }),
    upsert: jest.fn(async ({ where, create, update }: { where: { key: string }; create: Row; update: Partial<Row> }) => {
      const cur = rows.get(where.key);
      const next = cur ? { ...cur, ...update } : { ...create };
      rows.set(where.key, next as Row);
      return next;
    }),
    deleteMany: jest.fn(async ({ where }: { where: { createdAt: { lt: Date } } }) => {
      let count = 0;
      for (const [k, r] of rows) if (r.createdAt < where.createdAt.lt) (rows.delete(k), count++);
      return { count };
    }),
  };
  return { rows, prisma: { analysisCache } };
}

const RESULT = {
  title: 'Café',
  notes: null,
  items: [{ name: 'Ovo', grams: 100, kcal: 150, protein: 12, carbs: 1, fat: 10, confidence: 'medium' }],
  totals: { kcal: 150, protein: 12, carbs: 1, fat: 10 },
  hasCookedFood: true,
  preparationFat: { level: 'little', kind: 'oil', reason: 'frito' },
};

const toolResponse = (input: unknown) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 't', name: 'registrar_estimativa', input }],
});

function setup() {
  const { rows, prisma } = fakePrisma();
  const cache = new AnalysisCacheService(prisma as never);
  const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste', ANTHROPIC_MODEL: 'modelo-teste' }), cache);
  const create = jest.fn().mockResolvedValue(
    toolResponse({
      isFood: true,
      title: 'Café',
      hasCookedFood: true,
      preparationFat: { level: 'little', kind: 'oil', reason: 'frito' },
      items: RESULT.items,
    }),
  );
  (service as unknown as { client: unknown }).client = { messages: { create } };
  const logger = (service as unknown as { logger: { log: jest.Mock; debug: jest.Mock; warn: jest.Mock } }).logger;
  const log = jest.spyOn(logger, 'log').mockImplementation(() => {});
  jest.spyOn(logger, 'debug').mockImplementation(() => {});
  jest.spyOn((cache as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => {});
  return { rows, prisma, cache, service, create, log };
}

describe('AnalysisService.analyzeText com cache', () => {
  it('miss chama o Claude e grava; a mesma descrição (normalizada) é hit e não chama o SDK', async () => {
    const { rows, service, create, log } = setup();

    const first = await service.analyzeText('Dois ovos mexidos.');
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows.size).toBe(1);
    expect(log).toHaveBeenCalledWith('analysis cache miss');

    const second = await service.analyzeText('2 ovos  mexidos');
    expect(create).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('analysis cache hit');
    expect(second).toEqual(first);
    expect([...rows.values()][0].hits).toBe(1);
    expect([...rows.values()][0].lastHitAt).toBeInstanceOf(Date);
  });

  it('o hit devolve o mesmo formato de uma resposta nova (preparationFat, hasCookedFood, itens)', async () => {
    const { service } = setup();
    const fresh = await service.analyzeText('ovo frito');
    const hit = await service.analyzeText('ovo frito');
    expect(hit).toMatchObject({ hasCookedFood: true, preparationFat: { level: 'little', kind: 'oil' } });
    expect(hit.items).toHaveLength(fresh.items.length);
    expect(hit.totals).toEqual(fresh.totals);
  });

  it('resultado inválido (sem itens) não é gravado', async () => {
    const { rows, service, create } = setup();
    create.mockResolvedValue(toolResponse({ isFood: true, title: 'x', items: [] }));
    await expect(service.analyzeText('nada')).rejects.toThrow();
    expect(rows.size).toBe(0);

    const { cache } = setup();
    await cache.set('k', { ...RESULT, items: [] } as never);
    expect((cache as unknown as { prisma: { analysisCache: { upsert: jest.Mock } } }).prisma.analysisCache.upsert).not.toHaveBeenCalled();
  });

  it('entrada expirada refaz a chamada e renova a entrada', async () => {
    const { rows, service, create } = setup();
    await service.analyzeText('arroz e feijão');
    const row = [...rows.values()][0];
    row.createdAt = new Date(Date.now() - ANALYSIS_CACHE_TTL_MS - 1000);
    row.hits = 5;

    await service.analyzeText('arroz e feijão');
    expect(create).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(1);
    expect([...rows.values()][0].hits).toBe(0);
    expect(Date.now() - [...rows.values()][0].createdAt.getTime()).toBeLessThan(5000);
  });

  it('a chave muda quando o modelo ou o PROMPT_VERSION mudam (a entrada antiga não é reaproveitada)', async () => {
    const { rows, cache, service, create } = setup();
    await service.analyzeText('pão com manteiga');
    const other = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste', ANTHROPIC_MODEL: 'outro-modelo' }), cache);
    (other as unknown as { client: unknown }).client = { messages: { create } };
    jest.spyOn((other as unknown as { logger: { log: () => void; debug: () => void } }).logger, 'log').mockImplementation(() => {});
    jest.spyOn((other as unknown as { logger: { debug: () => void } }).logger, 'debug').mockImplementation(() => {});
    await other.analyzeText('pão com manteiga');
    expect(create).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(2);
  });

  it('o cache não guarda userId nem a descrição original: só hash, resultado e contadores', async () => {
    const { rows, service } = setup();
    await service.analyzeText('Almocei 150 g de frango da casa da Maria');
    const row = [...rows.values()][0];
    expect(Object.keys(row).sort()).toEqual(['createdAt', 'hits', 'key', 'lastHitAt', 'result']);
    expect(row.key).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(row).toLowerCase();
    expect(dump).not.toContain('maria');
    expect(dump).not.toContain('almocei');
  });

  it('falha do banco no cache não derruba a análise', async () => {
    const { prisma, service, create } = setup();
    prisma.analysisCache.findUnique.mockRejectedValue(new Error('db fora'));
    prisma.analysisCache.upsert.mockRejectedValue(new Error('db fora'));
    await expect(service.analyzeText('banana')).resolves.toMatchObject({ title: 'Café' });
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('sem cache configurado, funciona como antes (sempre chama o Claude)', async () => {
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    const create = jest.fn().mockResolvedValue(toolResponse({ isFood: true, title: 'x', items: RESULT.items }));
    (service as unknown as { client: unknown }).client = { messages: { create } };
    jest.spyOn((service as unknown as { logger: { debug: () => void } }).logger, 'debug').mockImplementation(() => {});
    await service.analyzeText('banana');
    await service.analyzeText('banana');
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe('AnalysisCacheService.purgeExpired', () => {
  it('apaga só as entradas com mais de 90 dias', async () => {
    const { rows, prisma } = fakePrisma();
    const cache = new AnalysisCacheService(prisma as never);
    jest.spyOn((cache as unknown as { logger: { log: () => void } }).logger, 'log').mockImplementation(() => {});
    const old = new Date(Date.now() - ANALYSIS_CACHE_TTL_MS - 1000);
    rows.set('velha', { key: 'velha', result: RESULT, hits: 0, createdAt: old, lastHitAt: null });
    rows.set('nova', { key: 'nova', result: RESULT, hits: 0, createdAt: new Date(), lastHitAt: null });
    expect(await cache.purgeExpired()).toBe(1);
    expect([...rows.keys()]).toEqual(['nova']);
  });
});

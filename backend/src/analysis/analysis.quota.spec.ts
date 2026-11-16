import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { AiQuotaExceededError } from '../ai-usage/ai-quota.service';
import { AnalysisService } from './analysis.service';
import { PROMPT_VERSION } from './analysis.prompt';
import { analysisCacheKey } from './analysis.normalize';

const ANALYSIS = {
  isFood: true,
  title: 'Almoço',
  hasCookedFood: false,
  preparationFat: { level: 'none', kind: 'unknown', reason: '' },
  items: [{ name: 'Arroz', grams: 100, kcal: 130, protein: 2.5, carbs: 28, fat: 0.3, confidence: 'high' }],
};
const LABEL = { name: 'Achocolatado', per100Available: true, per100: { kcal: 380, protein: 4, carbs: 88, fat: 2 }, confidence: 'high' };

const NO_USAGE = Symbol('sem usage');
const tool = (name: string, input: unknown, usage: unknown = { input_tokens: 1500, output_tokens: 300 }) => ({
  stop_reason: 'tool_use',
  content: [{ type: 'tool_use', id: 't', name, input }],
  ...(usage === NO_USAGE ? {} : { usage }),
});

function setup(env: Record<string, string> = {}, sdk?: jest.Mock) {
  const quota = {
    reserve: jest.fn().mockResolvedValue('reserva-1'),
    settle: jest.fn().mockResolvedValue(undefined),
    fail: jest.fn().mockResolvedValue(undefined),
  };
  const cacheRows = new Map<string, unknown>();
  const cache = {
    get: jest.fn(async (k: string) => cacheRows.get(k) ?? null),
    set: jest.fn(async (k: string, v: unknown) => void cacheRows.set(k, v)),
  };
  const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste', ...env }), cache as never, quota as never);
  const create = sdk ?? jest.fn().mockResolvedValue(tool('registrar_estimativa', ANALYSIS));
  (service as unknown as { client: unknown }).client = { messages: { create } };
  const logger = (service as unknown as { logger: { debug: () => void; log: () => void; warn: () => void; error: () => void } }).logger;
  for (const m of ['debug', 'log', 'warn', 'error'] as const) jest.spyOn(logger, m).mockImplementation(() => {});
  return { service, quota, create, cache, logger };
}

describe('AnalysisService + cota de IA', () => {
  it('foto: reserva ANTES da chamada (PHOTO, com o modelo) e fecha com os tokens do SDK', async () => {
    const order: string[] = [];
    const { service, quota, create } = setup({ ANTHROPIC_MODEL: 'modelo-base' });
    quota.reserve.mockImplementation(async () => (order.push('reserve'), 'r1'));
    create.mockImplementation(async () => (order.push('sdk'), tool('registrar_estimativa', ANALYSIS)));
    quota.settle.mockImplementation(async () => void order.push('settle'));

    await service.analyzePhoto(Buffer.from('img'), 'image/jpeg', undefined, 'user-1');

    expect(order).toEqual(['reserve', 'sdk', 'settle']);
    expect(quota.reserve).toHaveBeenCalledWith('user-1', 'PHOTO', 'modelo-base');
    expect(quota.settle).toHaveBeenCalledWith('r1', { input_tokens: 1500, output_tokens: 300 });
    expect(quota.fail).not.toHaveBeenCalled();
    expect(create.mock.calls[0][0].model).toBe('modelo-base');
  });

  it('descrição: miss reserva (TEXT); acerto de cache NÃO reserva, NÃO chama o SDK e NÃO consome cota', async () => {
    const { service, quota, create } = setup();
    await service.analyzeText('dois ovos mexidos', 'user-1');
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(quota.reserve.mock.calls[0].slice(0, 2)).toEqual(['user-1', 'TEXT']);

    await service.analyzeText('2 ovos mexidos', 'user-1'); // mesma descrição normalizada → hit
    expect(create).toHaveBeenCalledTimes(1);
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(quota.settle).toHaveBeenCalledTimes(1);
  });

  it('rótulo: reserva LABEL', async () => {
    const create = jest.fn().mockResolvedValue(tool('registrar_produto', LABEL));
    const { service, quota } = setup({}, create);
    await service.analyzeLabel([{ buffer: Buffer.from('t'), mimeType: 'image/jpeg', role: 'table' }], null, 'user-1');
    expect(quota.reserve.mock.calls[0].slice(0, 2)).toEqual(['user-1', 'LABEL']);
    expect(quota.settle).toHaveBeenCalledTimes(1);
  });

  it('sugestão (callTool): reserva SUGGEST e fecha com os tokens', async () => {
    const create = jest.fn().mockResolvedValue(tool('sugerir_refeicao', { suggestions: [] }, { input_tokens: 800, output_tokens: 600 }));
    const { service, quota } = setup({}, create);
    await service.callTool({
      system: 's',
      tool: { name: 'sugerir_refeicao', description: 'd', input_schema: { type: 'object' as const, properties: {} } },
      content: [{ type: 'text', text: 'oi' }],
      maxTokens: 100,
      truncatedMessage: 'x',
      feature: 'SUGGEST',
      userId: 'user-1',
    });
    expect(quota.reserve.mock.calls[0].slice(0, 2)).toEqual(['user-1', 'SUGGEST']);
    expect(quota.settle).toHaveBeenCalledWith('reserva-1', { input_tokens: 800, output_tokens: 600 });
  });

  it('falha do SDK: fecha como FAIL (não consome cota) e devolve o erro ao usuário', async () => {
    const create = jest.fn().mockRejectedValue(new Error('rede caiu'));
    const { service, quota } = setup({}, create);
    await expect(service.analyzePhoto(Buffer.from('i'), 'image/png', undefined, 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(quota.fail).toHaveBeenCalledWith('reserva-1');
    expect(quota.settle).not.toHaveBeenCalled();
  });

  it('erro de API do Claude (ex.: 500) também fecha como FAIL', async () => {
    const create = jest.fn().mockRejectedValue(new Anthropic.APIError(500, { message: 'boom' }, 'boom', new Headers()));
    const { service, quota } = setup({}, create);
    await expect(service.analyzeText('algo', 'user-1')).rejects.toBeDefined();
    expect(quota.fail).toHaveBeenCalledTimes(1);
  });

  it('cota esgotada: o 429 sobe com o código e o SDK NÃO é chamado', async () => {
    const { service, quota, create } = setup();
    const body = { code: 'AI_QUOTA_DAILY', message: 'm', feature: 'PHOTO', limit: 8, used: 8, resetsAt: '2026-11-17T03:00:00.000Z' } as const;
    quota.reserve.mockRejectedValue(new AiQuotaExceededError(body));
    const err = await service.analyzePhoto(Buffer.from('i'), 'image/png', undefined, 'user-1').catch((e) => e);
    expect(err).toBeInstanceOf(AiQuotaExceededError);
    expect(err.getStatus()).toBe(429);
    expect(err.getResponse()).toEqual(body);
    expect(create).not.toHaveBeenCalled();
  });

  it('resposta sem usage: grava 0 tokens (settle recebe undefined) e não bloqueia a pessoa', async () => {
    const create = jest.fn().mockResolvedValue(tool('registrar_estimativa', ANALYSIS, NO_USAGE));
    const { service, quota } = setup({}, create);
    await expect(service.analyzePhoto(Buffer.from('i'), 'image/png', undefined, 'user-1')).resolves.toBeDefined();
    expect(quota.settle).toHaveBeenCalledWith('reserva-1', undefined);
  });

  it('resposta truncada (max_tokens): os tokens foram gastos, então fecha como OK, e o usuário recebe o erro', async () => {
    const create = jest.fn().mockResolvedValue({ stop_reason: 'max_tokens', content: [], usage: { input_tokens: 100, output_tokens: 2000 } });
    const { service, quota } = setup({}, create);
    await expect(service.analyzeText('algo', 'user-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(quota.settle).toHaveBeenCalledWith('reserva-1', { input_tokens: 100, output_tokens: 2000 });
  });

  it('sem userId (ou sem serviço de cota), nada é medido nem bloqueado', async () => {
    const { service, quota } = setup();
    await service.analyzeText('sem usuário');
    expect(quota.reserve).not.toHaveBeenCalled();
    const bare = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    (bare as unknown as { client: unknown }).client = { messages: { create: jest.fn().mockResolvedValue(tool('registrar_estimativa', ANALYSIS)) } };
    await expect(bare.analyzeText('x', 'user-1')).resolves.toBeDefined();
  });

  describe('modelo por funcionalidade', () => {
    const env = { ANTHROPIC_MODEL: 'base', ANTHROPIC_MODEL_PHOTO: 'modelo-foto', ANTHROPIC_MODEL_SUGGEST: 'modelo-sugestao' };

    it('ANTHROPIC_MODEL_<FEATURE> vence; sem ele, vale ANTHROPIC_MODEL; sem nenhum, o padrão', () => {
      const { service } = setup(env);
      expect([service.modelFor('PHOTO'), service.modelFor('TEXT'), service.modelFor('LABEL'), service.modelFor('SUGGEST')]).toEqual([
        'modelo-foto',
        'base',
        'base',
        'modelo-sugestao',
      ]);
      const bare = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'k' }));
      expect(bare.modelFor('PHOTO')).toBe('claude-sonnet-5-5');
    });

    it('o modelo usado na chamada é o da funcionalidade e é o que vai para a reserva', async () => {
      const { service, quota, create } = setup(env);
      await service.analyzePhoto(Buffer.from('i'), 'image/png', undefined, 'user-1');
      expect(create.mock.calls[0][0].model).toBe('modelo-foto');
      expect(quota.reserve).toHaveBeenCalledWith('user-1', 'PHOTO', 'modelo-foto');
      await service.analyzeText('algo novo', 'user-1');
      expect(create.mock.calls[1][0].model).toBe('base');
    });

    it('a chave do cache de descrições inclui o modelo de TEXT e a PROMPT_VERSION', async () => {
      const { service, cache } = setup(env);
      await service.analyzeText('dois ovos', 'user-1');
      expect(cache.set.mock.calls[0][0]).toBe(analysisCacheKey('dois ovos', 'base', PROMPT_VERSION));
      expect(analysisCacheKey('dois ovos', 'modelo-foto')).not.toBe(analysisCacheKey('dois ovos', 'base'));
      expect(analysisCacheKey('dois ovos', 'base', PROMPT_VERSION)).not.toBe(analysisCacheKey('dois ovos', 'base', PROMPT_VERSION + 1));
      // trocar o modelo de TEXT invalida o cache (outra chave)
      const other = setup({ ...env, ANTHROPIC_MODEL_TEXT: 'novo-modelo' });
      await other.service.analyzeText('dois ovos', 'user-1');
      expect(other.cache.set.mock.calls[0][0]).toBe(analysisCacheKey('dois ovos', 'novo-modelo', PROMPT_VERSION));
    });
  });
});

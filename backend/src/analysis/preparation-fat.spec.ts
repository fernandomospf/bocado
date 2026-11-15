import { ConfigService } from '@nestjs/config';
import { AnalysisService, coerceAnalysis, coercePreparationFat } from './analysis.service';
import {
  buildPreparationFatTable,
  FAT_FALLBACK_PER100,
  FAT_TACO_SEARCH_NAMES,
  PreparationFatService,
} from './preparation-fat';

const ovos = { name: 'Ovos mexidos', grams: 110, kcal: 190, protein: 13, carbs: 1.5, fat: 14.5, confidence: 'medium' };

describe('parse da gordura de preparo', () => {
  it('lê hasCookedFood e preparationFat quando vêm certos', () => {
    const out = coerceAnalysis({
      isFood: true,
      items: [ovos],
      hasCookedFood: true,
      preparationFat: { level: 'little', kind: 'butter', reason: 'ovos brilhando' },
    });
    expect(out.hasCookedFood).toBe(true);
    expect(out.preparationFat).toEqual({ level: 'little', kind: 'butter', reason: 'ovos brilhando' });
  });

  it('sem os campos novos: hasCookedFood false e preparationFat none/unknown', () => {
    const out = coerceAnalysis({ isFood: true, items: [ovos] });
    expect(out.hasCookedFood).toBe(false);
    expect(out.preparationFat).toEqual({ level: 'none', kind: 'unknown', reason: '' });
  });

  it('valores inválidos caem no padrão; maiúsculas, string JSON e "true" são aceitos', () => {
    expect(coercePreparationFat({ level: 'muito', kind: 'banha' })).toEqual({ level: 'none', kind: 'unknown', reason: '' });
    expect(coercePreparationFat('lixo')).toEqual({ level: 'none', kind: 'unknown', reason: '' });
    expect(coercePreparationFat(null)).toEqual({ level: 'none', kind: 'unknown', reason: '' });
    expect(coercePreparationFat('{"level":"LOTS","kind":"Oil","reason":"fritura"}')).toEqual({
      level: 'lots',
      kind: 'oil',
      reason: 'fritura',
    });
    expect(coerceAnalysis({ items: [ovos], hasCookedFood: 'true' }).hasCookedFood).toBe(true);
    expect(coerceAnalysis({ items: [ovos], hasCookedFood: 'sim' }).hasCookedFood).toBe(false);
  });

  it('a resposta da análise inclui os campos novos (com e sem eles na saída da IA)', async () => {
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    const respond = (input: unknown) => {
      (service as unknown as { client: unknown }).client = {
        messages: {
          create: async () => ({
            stop_reason: 'tool_use',
            content: [{ type: 'tool_use', id: 't1', name: 'registrar_estimativa', input }],
          }),
        },
      };
    };

    respond({ isFood: true, title: 'Ovos', items: [ovos], hasCookedFood: true, preparationFat: { level: 'lots', kind: 'oil', reason: 'fritos' } });
    const com = await service.analyzeText('ovos fritos');
    expect(com.hasCookedFood).toBe(true);
    expect(com.preparationFat).toEqual({ level: 'lots', kind: 'oil', reason: 'fritos' });
    expect(com.items).toHaveLength(1);

    respond({ isFood: true, title: 'Ovos', items: [ovos] });
    const sem = await service.analyzeText('ovos');
    expect(sem.hasCookedFood).toBe(false);
    expect(sem.preparationFat).toEqual({ level: 'none', kind: 'unknown', reason: '' });
  });
});

describe('tabela de gorduras de preparo', () => {
  it('sem TACO usa as constantes, em todos os níveis × tipos', () => {
    const t = buildPreparationFatTable({});
    expect(t.oil.little).toEqual({ grams: 5, portion: '1 colher de chá', kcal: 44.2, protein: 0, carbs: 0, fat: 5 });
    expect(t.oil.lots).toEqual({ grams: 15, portion: '1 colher de sopa', kcal: 132.6, protein: 0, carbs: 0, fat: 15 });
    expect(t.butter.little).toMatchObject({ grams: 5, kcal: 36.3, fat: 4.1 });
    expect(t.butter.lots).toMatchObject({ grams: 15, kcal: 108.9, fat: 12.4 });
    expect(t.sauce.little).toMatchObject({ grams: 20, kcal: 60.4, carbs: 1.6, fat: 6.1 });
    expect(t.sauce.lots).toMatchObject({ grams: 50, kcal: 151.1, carbs: 4, fat: 15.3 });
    expect(Object.values(t).every((k) => !k.fromTaco)).toBe(true);
    expect([t.oil.label, t.butter.label, t.sauce.label]).toEqual(['óleo', 'manteiga', 'molho']);
  });

  it('usa os valores da TACO quando existem e completa o que faltar com as constantes', () => {
    const t = buildPreparationFatTable({ butter: { kcal: 700, protein: 1, carbs: 0, fat: 80 } });
    expect(t.butter.fromTaco).toBe(true);
    expect(t.butter.lots).toMatchObject({ grams: 15, kcal: 105, fat: 12 });
    expect(t.oil.fromTaco).toBe(false);
    expect(t.oil.per100).toEqual(FAT_FALLBACK_PER100.oil);
  });

  it('o serviço consulta a TACO uma vez e guarda o resultado', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { searchName: FAT_TACO_SEARCH_NAMES.oil, kcal100: 880, protein100: 0, carbs100: 0, fat100: 99.5 },
    ]);
    const service = new PreparationFatService({ food: { findMany } } as never);
    const t = await service.table();
    await service.table();
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(t.oil).toMatchObject({ fromTaco: true, little: { kcal: 44, fat: 5 } });
    expect(t.sauce.fromTaco).toBe(false);
  });

  it('com erro no banco devolve as constantes e tenta de novo depois', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('sem conexão'));
    const service = new PreparationFatService({ food: { findMany } } as never);
    jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => {});
    expect((await service.table()).oil.per100).toEqual(FAT_FALLBACK_PER100.oil);
    await service.table();
    expect(findMany).toHaveBeenCalledTimes(2);
  });
});

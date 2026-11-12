import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extractItemObjects, parseLooseJson, toNumber } from './analysis.parse';
import { AnalysisService, CoerceStats, coerceAnalysis } from './analysis.service';

// Exemplos reais do campo "items" vindos do modelo em produção, exatamente como chegaram.
const EXEMPLO_1 =
  '[{"name":"Ovo mexido","grams":100,"kcal":160,"protein":11,"carbs":1,"fat":12,"confidence":medium},{"name":"Café com leite UHT integral","grams":300,"kcal":110,"protein":7,"carbs":10,"fat":5,"confidence":"medium"}]';
const EXEMPLO_2 =
  '[{"name":"Ovos mexidos","grams":110,"kcal":185,"protein":12.5,"carbs":1.5,"fat":14,"confidence":"medium"},{"name":"Café com leite","grams":300,"kcal":95,"protein":5,"carbs":8,"fat":5copyright,"confidence":"medium"}]';

type Item = Record<string, unknown>;
const itemsOf = (raw: unknown, stats?: CoerceStats) => coerceAnalysis(raw, stats).items as Item[];

describe('parseLooseJson', () => {
  it('parseia JSON válido sem alterar', () => {
    expect(parseLooseJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('repara valor sem aspas e número com lixo grudado', () => {
    expect(parseLooseJson(EXEMPLO_1)).toHaveLength(2);
    expect(parseLooseJson(EXEMPLO_2)).toHaveLength(2);
  });

  it('não coloca aspas em true/false/null', () => {
    expect(parseLooseJson('{"a":true,"b":null,"c":medium}')).toEqual({ a: true, b: null, c: 'medium' });
  });
});

describe('extractItemObjects', () => {
  it('aproveita os objetos bons mesmo com um quebrado no meio', () => {
    const out = extractItemObjects('[{"name":"A","kcal":1}, {"name": "B", "kcal": ]]] }, {"name":"C","kcal":3}]');
    expect(out).toEqual(expect.arrayContaining([{ name: 'A', kcal: 1 }, { name: 'C', kcal: 3 }]));
  });
});

describe('toNumber', () => {
  it.each([
    [12.5, 12.5],
    ['12,5', 12.5],
    ['120 g', 120],
    ['5copyright', 5],
    ['abc', 0],
    [undefined, 0],
  ])('%p → %p', (input, expected) => {
    expect(toNumber(input)).toBe(expected);
  });
});

describe('coerceAnalysis com items malformados', () => {
  it('exemplo real 1 (confidence sem aspas) → 2 itens, o primeiro com confidence "medium"', () => {
    const items = itemsOf({ isFood: true, title: 'Café', items: EXEMPLO_1 });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Ovo mexido', grams: 100, kcal: 160, confidence: 'medium' });
    expect(items[1]).toMatchObject({ name: 'Café com leite UHT integral', fat: 5, confidence: 'medium' });
  });

  it('exemplo real 2 (lixo grudado no número) → 2 itens, o segundo com fat = 5', () => {
    const items = itemsOf({ isFood: true, title: 'Café', items: EXEMPLO_2 });
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({ name: 'Café com leite', fat: 5, kcal: 95 });
  });

  it('items já como array normal passa sem mudança', () => {
    const item = { name: 'Ovos', grams: 110, kcal: 185, protein: 12.5, carbs: 1.5, fat: 14, confidence: 'medium' };
    const stats: CoerceStats = { discarded: 0 };
    expect(itemsOf({ isFood: true, items: [item] }, stats)).toEqual([item]);
    expect(stats.discarded).toBe(0);
  });

  it('item com "12,5" e "120 g" → 12.5 e 120', () => {
    const items = itemsOf({
      items: [{ name: 'Frango', grams: '120 g', kcal: '198', protein: '12,5', carbs: 0, fat: '4,3', confidence: 'high' }],
    });
    expect(items[0]).toMatchObject({ grams: 120, protein: 12.5, kcal: 198, fat: 4.3 });
  });

  it('confidence fora de low/medium/high vira "low"', () => {
    const items = itemsOf({ items: [{ name: 'X', kcal: 1, confidence: 'alta' }, { name: 'Y', kcal: 1 }] });
    expect(items.map((i) => i.confidence)).toEqual(['low', 'low']);
  });

  it('string totalmente inválida → [] e conta como descartado', () => {
    const stats: CoerceStats = { discarded: 0 };
    expect(itemsOf({ isFood: true, items: 'isso não é json nenhum' }, stats)).toEqual([]);
    expect(stats.discarded).toBe(1);
  });

  it('conta os itens irreparáveis quando parte dos objetos se salva', () => {
    const stats: CoerceStats = { discarded: 0 };
    const items = itemsOf({ items: '[{"name":"A","kcal":1}, {"name": "B", "kcal": ]]] }' }, stats);
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items[0]).toMatchObject({ name: 'A', kcal: 1 });
  });
});

describe('AnalysisService com items inválidos', () => {
  it('responde 422 quando não sobra nenhum item válido', async () => {
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    const fakeMessage = {
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't1', name: 'registrar_estimativa', input: { isFood: true, items: 'lixo total' } }],
    };
    // Substitui só a chamada de rede; o resto do fluxo (coerce + normalize) roda de verdade.
    (service as unknown as { client: { messages: { create: () => Promise<unknown> } } }).client = {
      messages: { create: async () => fakeMessage },
    };
    jest.spyOn((service as unknown as { logger: { warn: () => void } }).logger, 'warn').mockImplementation(() => {});

    await expect(service.analyzeText('qualquer coisa')).rejects.toBeInstanceOf(UnprocessableEntityException);
  });
});

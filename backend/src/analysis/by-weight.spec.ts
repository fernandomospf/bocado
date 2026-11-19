import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnalysisService } from './analysis.service';
import { byWeightUserText, rescaleToTotal } from './by-weight';
import { AnalyzePhotoDto } from './dto/analysis.dto';

const item = (grams: number, kcal = grams * 1.5) => ({ name: 'x', grams, kcal, protein: grams / 10, carbs: grams / 5, fat: grams / 20, confidence: 'high' as const });
const sumGrams = (items: { grams: number }[]) => Math.round(items.reduce((s, i) => s + i.grams, 0) * 10) / 10;

describe('rescaleToTotal', () => {
  it('a soma das gramas é EXATAMENTE o total, mesmo com dízimas', () => {
    for (const total of [520, 333.3, 1000, 777.7, 50, 3000]) {
      const out = rescaleToTotal([item(100), item(70), item(33), item(11)], total);
      expect(sumGrams(out)).toBe(total);
    }
    // 3 itens iguais em 100 g: 33,3 + 33,3 + 33,4
    const thirds = rescaleToTotal([item(10), item(10), item(10)], 100);
    expect(sumGrams(thirds)).toBe(100);
    expect(thirds.map((i) => i.grams).sort()).toEqual([33.3, 33.3, 33.4]);
  });

  it('mantém a proporção e escala kcal e macros junto (1 casa decimal)', () => {
    const out = rescaleToTotal([item(100), item(200)], 600); // fator 2
    expect(out.map((i) => i.grams)).toEqual([200, 400]);
    expect(out[0].kcal).toBe(300);
    expect(out[1].kcal).toBe(600);
    expect(out[1].protein).toBe(40);
    expect(out[1].carbs).toBe(80);
    expect(out[1].fat).toBe(20);
    // proporção entre os itens preservada
    expect(out[1].grams / out[0].grams).toBe(2);
  });

  it('encolhe quando o total é menor que o estimado', () => {
    const out = rescaleToTotal([item(300), item(300)], 300);
    expect(out.map((i) => i.grams)).toEqual([150, 150]);
    expect(out[0].kcal).toBe(225);
  });

  it('item de 0 g continua com 0 g; tudo zerado divide igualmente', () => {
    const a = rescaleToTotal([item(100), item(0, 0)], 200);
    expect(a.map((i) => i.grams)).toEqual([200, 0]);
    const b = rescaleToTotal([item(0, 5), item(0, 7)], 200);
    expect(b.map((i) => i.grams)).toEqual([100, 100]);
    expect(b.map((i) => i.kcal)).toEqual([5, 7]);
  });

  it('lista vazia devolve lista vazia', () => {
    expect(rescaleToTotal([], 500)).toEqual([]);
  });
});

describe('texto da análise por quilo', () => {
  it('traz o peso e a instrução de distribuir', () => {
    expect(byWeightUserText(520)).toContain('Peso total do prato na balança: 520 g (sem o prato). Distribua esse peso entre os itens.');
  });
});

describe('AnalyzePhotoDto: modo e peso', () => {
  const check = (raw: Record<string, unknown>) => validate(plainToInstance(AnalyzePhotoDto, raw));
  it('aceita de 50 a 3000 g (o multipart manda texto)', async () => {
    expect(await check({ mode: 'by_weight', totalGrams: '520' })).toHaveLength(0);
    expect(await check({ mode: 'by_weight', totalGrams: '50' })).toHaveLength(0);
    expect(await check({ mode: 'by_weight', totalGrams: '3000' })).toHaveLength(0);
  });
  it('recusa fora dos limites e modo desconhecido', async () => {
    expect(await check({ mode: 'by_weight', totalGrams: '49.9' })).not.toHaveLength(0);
    expect(await check({ mode: 'by_weight', totalGrams: '3001' })).not.toHaveLength(0);
    expect(await check({ mode: 'by_weight', totalGrams: 'abc' })).not.toHaveLength(0);
    expect(await check({ mode: 'outro', totalGrams: '500' })).not.toHaveLength(0);
  });
});

describe('AnalysisService.analyzePhoto por quilo', () => {
  const ANALYSIS = {
    isFood: true,
    title: 'Prato',
    hasCookedFood: true,
    preparationFat: { level: 'little', kind: 'oil', reason: 'refogado' },
    items: [
      { name: 'Arroz', grams: 150, kcal: 195, protein: 3.6, carbs: 42, fat: 0.4, confidence: 'high' },
      { name: 'Feijão', grams: 100, kcal: 76, protein: 4.8, carbs: 13.6, fat: 0.5, confidence: 'medium' },
      { name: 'Frango', grams: 120, kcal: 190, protein: 36, carbs: 0, fat: 4.5, confidence: 'medium' },
    ],
  };

  function setup() {
    const quota = {
      reserve: jest.fn().mockResolvedValue('r1'),
      settle: jest.fn().mockResolvedValue(undefined),
      fail: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }), undefined, quota as never);
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 't', name: 'registrar_estimativa', input: ANALYSIS }],
      usage: { input_tokens: 1000, output_tokens: 200 },
    });
    (service as unknown as { client: unknown }).client = { messages: { create } };
    const logger = (service as unknown as { logger: Record<string, () => void> }).logger;
    for (const m of ['debug', 'log', 'warn', 'error']) logger[m] = () => undefined;
    return { service, quota, create };
  }

  it('reescala para o peso, marca estimated, não mexe na gordura de preparo e consome a cota de foto', async () => {
    const { service, quota, create } = setup();
    const res = await service.analyzePhoto(Buffer.from('img'), 'image/jpeg', undefined, 'u1', 520);

    expect(sumGrams(res.items)).toBe(520);
    expect(res.totalGrams).toBe(520);
    expect(res.items.every((i) => i.estimated === true)).toBe(true);
    // 150:100:120 mantidos
    expect(res.items[0].grams / res.items[1].grams).toBeCloseTo(1.5, 1);
    // a gordura de preparo continua fora dos itens e intacta
    expect(res.items).toHaveLength(3);
    expect(res.preparationFat).toEqual({ level: 'little', kind: 'oil', reason: 'refogado' });
    // totais = soma dos itens reescalados
    expect(res.totals.kcal).toBe(Math.round(res.items.reduce((s, i) => s + i.kcal, 0)));

    // cota: reserva PHOTO uma vez e fecha com os tokens
    expect(quota.reserve).toHaveBeenCalledTimes(1);
    expect(quota.reserve.mock.calls[0].slice(0, 2)).toEqual(['u1', 'PHOTO']);
    expect(quota.settle).toHaveBeenCalledTimes(1);

    // texto e prompt da chamada
    const call = create.mock.calls[0][0];
    const text = call.messages[0].content.find((b: { type: string }) => b.type === 'text').text as string;
    expect(text).toContain('Peso total do prato na balança: 520 g (sem o prato). Distribua esse peso entre os itens.');
    expect(call.system).toContain('self-service');
  });

  it('análise comum não muda: sem totalGrams as gramas ficam como a IA estimou', async () => {
    const { service, create } = setup();
    const res = await service.analyzePhoto(Buffer.from('img'), 'image/jpeg', undefined, 'u1');
    expect(res.totalGrams).toBeUndefined();
    expect(res.items[0].grams).toBe(150);
    expect(res.items[0].estimated).toBeUndefined();
    expect(create.mock.calls[0][0].system).not.toContain('self-service');
  });
});

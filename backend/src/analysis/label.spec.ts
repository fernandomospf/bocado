import { ConfigService } from '@nestjs/config';
import { AnalysisService } from './analysis.service';
import { coerceLabel, labelSanity } from './label';

describe('coerceLabel', () => {
  it('usa a coluna de 100 g quando existe', () => {
    const d = coerceLabel(
      {
        name: 'Biscoito de chocolate recheado',
        brand: 'Marca X',
        per100Available: true,
        per100: { kcal: 480, protein: 6.5, carbs: 68, fat: 20 },
        serving: { grams: 30, label: '30 g (6 biscoitos)' },
        confidence: 'high',
      },
      '7891000100080',
    );
    expect(d).toMatchObject({
      barcode: '7891000100080',
      name: 'Biscoito de chocolate recheado',
      brand: 'Marca X',
      per100: { kcal: 480, protein: 6.5, carbs: 68, fat: 20 },
      serving: { grams: 30, label: '30 g (6 biscoitos)' },
      per100Available: true,
      confidence: 'high',
      errors: [],
    });
  });

  it('só com valores por porção: calcula per100 = porção ÷ gramas × 100', () => {
    const d = coerceLabel(
      {
        name: 'Granola',
        per100Available: false,
        perServing: { kcal: 160, protein: 4, carbs: 26, fat: 4.5 },
        serving: { grams: 40, label: '40 g (4 colheres de sopa)' },
        confidence: 'medium',
      },
      null,
    );
    expect(d.per100).toEqual({ kcal: 400, protein: 10, carbs: 65, fat: 11.3 });
    expect(d.per100Available).toBe(false);
    expect(d.warnings[0]).toMatch(/só tinha os valores por porção/);
    expect(d.errors).toEqual([]);
  });

  it('aceita números como texto e a resposta como string JSON malformada', () => {
    const d = coerceLabel(
      '{"name":"Iogurte","per100Available":true,"per100":{"kcal":"62","protein":"3,5","carbs":"4,8 g","fat":"3.2"},"confidence":high}',
      null,
    );
    expect(d.per100).toEqual({ kcal: 62, protein: 3.5, carbs: 4.8, fat: 3.2 });
    expect(d.confidence).toBe('high');
  });

  it('sem valores legíveis: erro para preencher à mão', () => {
    const d = coerceLabel({ name: 'Produto', confidence: 'low' }, null);
    expect(d.errors[0]).toMatch(/Não conseguimos ler/);
    expect(d.confidence).toBe('low');
  });
});

describe('labelSanity', () => {
  it('kcal acima de 900 por 100 g é erro (provável coluna da porção ou kJ)', () => {
    expect(labelSanity({ kcal: 2008, protein: 6.5, carbs: 68, fat: 20 }).errors[0]).toMatch(/900 kcal/);
  });

  it('proteína + carboidratos + gorduras acima de 100 g é erro', () => {
    expect(labelSanity({ kcal: 500, protein: 30, carbs: 60, fat: 20 }).errors[0]).toMatch(/passam de 100 g/);
  });

  it('kcal destoando mais de 20% de 4P + 4C + 9G gera aviso (não bloqueia)', () => {
    const out = labelSanity({ kcal: 300, protein: 6.5, carbs: 68, fat: 20 }); // esperado ~478
    expect(out.errors).toEqual([]);
    expect(out.warnings[0]).toMatch(/diferem mais de 20%/);
  });

  it('valores coerentes passam sem erro nem aviso', () => {
    expect(labelSanity({ kcal: 480, protein: 6.5, carbs: 68, fat: 20 })).toEqual({ errors: [], warnings: [] });
  });
});

describe('AnalysisService.analyzeLabel (cliente simulado, sem rede)', () => {
  it('envia frente e tabela como imagens, usa a ferramenta registrar_produto e devolve o rascunho', async () => {
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        {
          type: 'tool_use',
          id: 't1',
          name: 'registrar_produto',
          input: { name: 'Achocolatado', per100Available: true, per100: { kcal: 380, protein: 4, carbs: 88, fat: 2 }, confidence: 'high' },
        },
      ],
    });
    (service as unknown as { client: unknown }).client = { messages: { create } };
    jest.spyOn((service as unknown as { logger: { debug: () => void } }).logger, 'debug').mockImplementation(() => {});

    const draft = await service.analyzeLabel(
      [
        { buffer: Buffer.from('frente'), mimeType: 'image/jpeg', role: 'front' },
        { buffer: Buffer.from('tabela'), mimeType: 'image/jpeg', role: 'table' },
      ],
      '7891000100080',
    );

    const request = create.mock.calls[0][0];
    expect(request.tools[0].name).toBe('registrar_produto');
    expect(request.tool_choice).toEqual({ type: 'auto' });
    expect(request.messages[0].content.filter((b: { type: string }) => b.type === 'image')).toHaveLength(2);
    expect(draft).toMatchObject({ barcode: '7891000100080', name: 'Achocolatado', per100: { kcal: 380 } });
  });

  it('recusa formato de imagem não suportado antes de chamar a IA', async () => {
    const service = new AnalysisService(new ConfigService({ ANTHROPIC_API_KEY: 'teste' }));
    const create = jest.fn();
    (service as unknown as { client: unknown }).client = { messages: { create } };
    await expect(service.analyzeLabel([{ buffer: Buffer.from('x'), mimeType: 'image/heic', role: 'table' }], null)).rejects.toThrow(
      /Formato de imagem/,
    );
    expect(create).not.toHaveBeenCalled();
  });
});

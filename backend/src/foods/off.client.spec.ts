import { mapOffProduct, OffClient } from './off.client';

const complete = {
  product_name: 'Biscuit Chocolate',
  product_name_pt: 'Biscoito de chocolate',
  brands: 'Marca X, Grupo Y',
  serving_size: '30 g (6 biscoitos)',
  serving_quantity: 30,
  nutriments: {
    'energy-kcal_100g': 480,
    proteins_100g: 6.5,
    carbohydrates_100g: 68,
    fat_100g: 20,
  },
};

describe('mapOffProduct', () => {
  it('mapeia nome em português, primeira marca, valores por 100 g e porção', () => {
    expect(mapOffProduct(complete)).toEqual({
      name: 'Biscoito de chocolate',
      brand: 'Marca X',
      per100: { kcal: 480, protein: 6.5, carbs: 68, fat: 20 },
      serving: { grams: 30, label: '30 g (6 biscoitos)' },
    });
  });

  it('sem nome em português, usa o nome geral', () => {
    expect(mapOffProduct({ ...complete, product_name_pt: '' })?.name).toBe('Biscuit Chocolate');
  });

  it('sem kcal, converte energy_100g de kJ para kcal (÷ 4,184)', () => {
    const { 'energy-kcal_100g': _, ...rest } = complete.nutriments;
    const out = mapOffProduct({ ...complete, nutriments: { ...rest, energy_100g: 2008 } });
    expect(out?.per100.kcal).toBe(479.9);
  });

  it('aceita números como string', () => {
    const out = mapOffProduct({
      ...complete,
      nutriments: { 'energy-kcal_100g': '480', proteins_100g: '6,5', carbohydrates_100g: '68', fat_100g: '20' },
    });
    expect(out?.per100).toEqual({ kcal: 480, protein: 6.5, carbs: 68, fat: 20 });
  });

  it.each([
    ['sem proteína', { proteins_100g: undefined }],
    ['sem carboidrato', { carbohydrates_100g: undefined }],
    ['sem gordura', { fat_100g: undefined }],
    ['sem energia (nem kcal nem kJ)', { 'energy-kcal_100g': undefined }],
  ])('incompleto %s → null', (_, patch) => {
    expect(mapOffProduct({ ...complete, nutriments: { ...complete.nutriments, ...patch } })).toBeNull();
  });

  it('sem nome → null', () => {
    expect(mapOffProduct({ ...complete, product_name: '', product_name_pt: '' })).toBeNull();
  });

  it('valores impossíveis → null (kcal > 900 ou macros > 100 g)', () => {
    expect(mapOffProduct({ ...complete, nutriments: { ...complete.nutriments, 'energy-kcal_100g': 1200 } })).toBeNull();
    expect(mapOffProduct({ ...complete, nutriments: { ...complete.nutriments, carbohydrates_100g: 90 } })).toBeNull();
  });

  it('sem porção válida → serving null', () => {
    expect(mapOffProduct({ ...complete, serving_quantity: 0 })?.serving).toBeNull();
    expect(mapOffProduct({ ...complete, serving_quantity: undefined })?.serving).toBeNull();
  });
});

describe('OffClient.lookup (fetch simulado, sem rede)', () => {
  const config = (contact?: string) => ({ get: () => contact }) as never;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  const respond = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));

  it('produto completo → found, com User-Agent e timeout', async () => {
    respond(200, { status: 1, product: complete });
    const out = await new OffClient(config('contato@exemplo.com')).lookup('4006381333931');
    expect(out).toMatchObject({ status: 'found', product: { name: 'Biscoito de chocolate' } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v2/product/4006381333931?fields=');
    expect(init.headers['User-Agent']).toBe('Bocado/1.0 (contato@exemplo.com)');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sem OFF_CONTACT, o User-Agent não leva contato', async () => {
    respond(200, { status: 1, product: complete });
    await new OffClient(config()).lookup('4006381333931');
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toBe('Bocado/1.0');
  });

  it('404 ou status 0 → missing', async () => {
    respond(404, { status: 0 });
    expect(await new OffClient(config()).lookup('1')).toEqual({ status: 'missing' });
    respond(200, { status: 0, status_verbose: 'product not found' });
    expect(await new OffClient(config()).lookup('1')).toEqual({ status: 'missing' });
  });

  it('produto incompleto → missing', async () => {
    respond(200, { status: 1, product: { ...complete, nutriments: {} } });
    expect(await new OffClient(config()).lookup('1')).toEqual({ status: 'missing' });
  });

  it('erro 5xx, timeout ou falha de rede → error (não vira cache negativo)', async () => {
    respond(503, {});
    expect(await new OffClient(config()).lookup('1')).toEqual({ status: 'error' });
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
    expect(await new OffClient(config()).lookup('1')).toEqual({ status: 'error' });
  });
});

import { barcodeKey, barcodePairs, clusterPairs, valuesClose } from './duplicates';

const base = { kcal100: 380, protein100: 4, carbs100: 88, fat100: 2 };

describe('valuesClose (por 100 g, até 5%)', () => {
  it('aceita diferença de até 5% em cada valor', () => {
    expect(valuesClose(base, { kcal100: 395, protein100: 4.1, carbs100: 90, fat100: 2.05 })).toBe(true);
  });
  it('recusa quando um dos valores passa de 5%', () => {
    expect(valuesClose(base, { ...base, kcal100: 420 })).toBe(false); // ~10%
    expect(valuesClose(base, { ...base, carbs100: 70 })).toBe(false);
  });
  it('valores minúsculos não viram "diferentes" por décimos', () => {
    expect(valuesClose({ ...base, fat100: 0 }, { ...base, fat100: 0.2 })).toBe(true);
  });
});

describe('código de barras', () => {
  it('ignora zeros à esquerda; sem código ou código curto não casa', () => {
    expect(barcodeKey('0078915000012')).toBe(barcodeKey('78915000012'));
    expect(barcodeKey(null)).toBeNull();
    expect(barcodeKey('0000012')).toBeNull();
  });
  it('gera pares só entre produtos com o mesmo código', () => {
    const mk = (id: string, barcode: string | null) => ({ id, barcode, ...base });
    const pairs = barcodePairs([mk('a', '0078915000012'), mk('b', '78915000012'), mk('c', '7891000100103'), mk('d', null)]);
    expect(pairs).toEqual([{ a: 'a', b: 'b', reason: 'barcode' }]);
  });
});

describe('clusterPairs', () => {
  it('une A~B e B~C num grupo só e mantém grupos separados', () => {
    const groups = clusterPairs([
      { a: 'a', b: 'b', reason: 'name' },
      { a: 'b', b: 'c', reason: 'barcode' },
      { a: 'x', b: 'y', reason: 'name' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.ids.includes('a'))).toEqual({ ids: ['a', 'b', 'c'], reasons: ['barcode', 'name'] });
    expect(groups.find((g) => g.ids.includes('x'))?.ids).toEqual(['x', 'y']);
  });
});

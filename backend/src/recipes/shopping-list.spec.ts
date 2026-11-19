import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ShoppingListDto } from './dto/recipe.dto';
import { buildShoppingList, OTHER_CATEGORY, roundGrams } from './shopping-list';

describe('roundGrams', () => {
  it('arredonda a 10 g e nunca devolve 0', () => {
    expect(roundGrams(124)).toBe(120);
    expect(roundGrams(125)).toBe(130);
    expect(roundGrams(3)).toBe(10);
  });
});

describe('buildShoppingList', () => {
  it('soma por nome normalizado (acento e caixa) vezes as preparações', () => {
    const groups = buildShoppingList([
      { times: 2, ingredients: [{ name: 'Feijão', grams: 200, category: 'Leguminosas' }, { name: 'Cebola', grams: 50, category: null }] },
      { times: 1, ingredients: [{ name: 'feijao', grams: 100, category: 'Leguminosas' }, { name: 'CEBOLA ', grams: 30, category: null }] },
    ]);
    const all = groups.flatMap((g) => g.items);
    expect(all.find((i) => i.name === 'Feijão')?.grams).toBe(500); // 2x200 + 100
    expect(all.find((i) => i.name.toLowerCase() === 'cebola')?.grams).toBe(130); // 2x50 + 30
    expect(all).toHaveLength(2);
  });

  it('agrupa pela categoria da TACO; sem categoria vai para "Outros", sempre por último', () => {
    const groups = buildShoppingList([
      {
        times: 1,
        ingredients: [
          { name: 'Arroz', grams: 300, category: 'Cereais e derivados' },
          { name: 'Molho X', grams: 100, category: null },
          { name: 'Feijão', grams: 200, category: 'Leguminosas e derivados' },
        ],
      },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['Cereais e derivados', 'Leguminosas e derivados', OTHER_CATEGORY]);
  });

  it('arredonda cada total a 10 g, ordena por nome e ignora ingredientes vazios', () => {
    const [g] = buildShoppingList([
      { times: 3, ingredients: [{ name: 'Ovo', grams: 41.7, category: 'Ovos' }, { name: 'Alho', grams: 4, category: 'Ovos' }, { name: '  ', grams: 5, category: null }, { name: 'Sal', grams: 0, category: null }] },
    ]);
    expect(g.items).toEqual([
      { name: 'Alho', grams: 10 }, // 12 g -> 10
      { name: 'Ovo', grams: 130 }, // 125,1 -> 130
    ]);
  });
});

describe('ShoppingListDto', () => {
  const check = (items: unknown) => validate(plainToInstance(ShoppingListDto, { items }));
  const id = '5b1d6e2e-9a7e-4c1e-8f0a-0b2d3c4d5e6f';
  it('vezes de 1 a 10', async () => {
    expect(await check([{ recipeId: id, times: 1 }])).toHaveLength(0);
    expect(await check([{ recipeId: id, times: 10 }])).toHaveLength(0);
    expect(await check([{ recipeId: id, times: 0 }])).not.toHaveLength(0);
    expect(await check([{ recipeId: id, times: 11 }])).not.toHaveLength(0);
    expect(await check([{ recipeId: id, times: 1.5 }])).not.toHaveLength(0);
  });
  it('exige ao menos uma receita com id válido', async () => {
    expect(await check([])).not.toHaveLength(0);
    expect(await check([{ recipeId: 'x', times: 1 }])).not.toHaveLength(0);
  });
});

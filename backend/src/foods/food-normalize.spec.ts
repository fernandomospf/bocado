import { NotFoundException } from '@nestjs/common';
import { FoodSource } from '@prisma/client';
import { fromPer100, normalizeName, searchTokens, toPer100 } from './food-normalize';
import { FoodsService } from './foods.service';

describe('normalizeName', () => {
  it.each([
    ['Feijão, carioca, cozido', 'feijao carioca cozido'],
    ['  PÃO   francês ', 'pao frances'],
    ['Café, infusão 10%', 'cafe infusao 10'],
    ['Ovo, de galinha, inteiro, cozido/10minutos', 'ovo de galinha inteiro cozido 10minutos'],
    ['Maçã Fuji', 'maca fuji'],
    ['Lingüiça', 'linguica'],
    ['', ''],
  ])('%p → %p', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});

describe('searchTokens', () => {
  it('remove palavras vazias', () => {
    expect(searchTokens('Peito de frango')).toEqual(['peito', 'frango']);
  });

  it('mantém a busca se ela só tiver palavras vazias', () => {
    expect(searchTokens('de')).toEqual(['de']);
  });

  it('limita a 6 palavras', () => {
    expect(searchTokens('a1 b2 c3 d4 e5 f6 g7 h8')).toHaveLength(6);
  });
});

describe('escala por 100 g', () => {
  it('converte uma porção para valores por 100 g', () => {
    expect(toPer100(50, { kcal: 73, protein: 6.7, carbs: 0.3, fat: 4.8 })).toEqual({
      kcal: 146,
      protein: 13.4,
      carbs: 0.6,
      fat: 9.6,
    });
  });

  it('porção sem peso não pode ser convertida', () => {
    expect(toPer100(0, { kcal: 100, protein: 1, carbs: 1, fat: 1 })).toBeNull();
  });

  it('calcula uma porção a partir dos valores por 100 g', () => {
    const arroz = { kcal: 128.3, protein: 2.5, carbs: 28.1, fat: 0.2 };
    expect(fromPer100(arroz, 125)).toEqual({ kcal: 160.4, protein: 3.1, carbs: 35.1, fat: 0.3 });
  });

  it('ida e volta preserva os valores', () => {
    const per100 = { kcal: 299.8, protein: 8, carbs: 58.6, fat: 3.1 };
    expect(toPer100(100, fromPer100(per100, 100))).toEqual(per100);
  });
});

describe('FoodsService.remove (posse)', () => {
  const deleteMany = jest.fn();
  const service = new FoodsService({ food: { deleteMany } } as never, {} as never, {} as never);

  beforeEach(() => deleteMany.mockReset());

  it('só apaga alimento CUSTOM do próprio usuário', async () => {
    deleteMany.mockResolvedValue({ count: 1 });
    await service.remove('user-1', 'food-1');
    expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'food-1', userId: 'user-1', source: FoodSource.CUSTOM } });
  });

  it('responde 404 para alimento de outro usuário ou da TACO', async () => {
    deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('user-1', 'food-de-outro')).rejects.toBeInstanceOf(NotFoundException);
  });
});

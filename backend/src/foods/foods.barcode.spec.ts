import { BadRequestException } from '@nestjs/common';
import { FoodSource, FoodStatus, Prisma } from '@prisma/client';
import { BARCODE_MISS_TTL_MS, FoodsService } from './foods.service';

const CODE = '4006381333931';

const offFood = {
  id: 'food-off',
  name: 'Biscoito de chocolate',
  brand: 'Marca X',
  barcode: CODE,
  source: FoodSource.OFF,
  status: FoodStatus.ACTIVE,
  kcal100: 480,
  protein100: 6.5,
  carbs100: 68,
  fat100: 20,
  portionGrams: null,
  portionLabel: null,
  servingGrams: 30,
  servingLabel: '30 g (6 biscoitos)',
};

const product = {
  name: 'Biscoito de chocolate',
  brand: 'Marca X',
  per100: { kcal: 480, protein: 6.5, carbs: 68, fat: 20 },
  serving: { grams: 30, label: '30 g (6 biscoitos)' },
};

function setup() {
  const prisma = {
    food: { findUnique: jest.fn(), create: jest.fn(), findUniqueOrThrow: jest.fn() },
    barcodeMiss: { findUnique: jest.fn(), upsert: jest.fn(), deleteMany: jest.fn() },
  };
  const off = { lookup: jest.fn() };
  return { prisma, off, service: new FoodsService(prisma as never, {} as never, off as never) };
}

describe('FoodsService.lookupBarcode', () => {
  it('código inválido → 400, sem consultar nada', async () => {
    const { prisma, off, service } = setup();
    await expect(service.lookupBarcode('4006381333932')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.food.findUnique).not.toHaveBeenCalled();
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('1) achou no acervo local → origin local, sem chamar o OFF', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(offFood);

    const out = await service.lookupBarcode(CODE);

    expect(out).toMatchObject({
      found: true,
      origin: 'local',
      food: { id: 'food-off', origin: 'off', brand: 'Marca X', portion: { grams: 30, label: '30 g (6 biscoitos)' } },
    });
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('UPC-A é procurado como EAN-13 (zero à esquerda)', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(offFood);
    await service.lookupBarcode('036000291452');
    expect(prisma.food.findUnique).toHaveBeenCalledWith({ where: { barcode: '0036000291452' } });
  });

  it('produto denunciado no acervo → não encontrado (até a revisão)', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue({ ...offFood, status: FoodStatus.REPORTED });
    expect(await service.lookupBarcode(CODE)).toEqual({ found: false, code: CODE });
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('cache negativo recente (< 7 dias) → não encontrado, sem chamar o OFF', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue({ code: CODE, checkedAt: new Date(Date.now() - 86_400_000) });

    expect(await service.lookupBarcode(CODE)).toEqual({ found: false, code: CODE });
    expect(off.lookup).not.toHaveBeenCalled();
  });

  it('cache negativo vencido (> 7 dias) → consulta o OFF de novo', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue({ code: CODE, checkedAt: new Date(Date.now() - BARCODE_MISS_TTL_MS - 1) });
    off.lookup.mockResolvedValue({ status: 'missing' });

    await service.lookupBarcode(CODE);
    expect(off.lookup).toHaveBeenCalledWith(CODE);
  });

  it('2) OFF completo → salva como OFF compartilhado e devolve origin off', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue(null);
    off.lookup.mockResolvedValue({ status: 'found', product });
    prisma.food.create.mockResolvedValue(offFood);

    const out = await service.lookupBarcode(CODE);

    expect(prisma.food.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: FoodSource.OFF,
        barcode: CODE,
        brand: 'Marca X',
        searchName: 'biscoito de chocolate marca x',
        kcal100: 480,
        servingGrams: 30,
        servingLabel: '30 g (6 biscoitos)',
      }),
    });
    // compartilhado: nunca grava userId
    expect(prisma.food.create.mock.calls[0][0].data.userId).toBeUndefined();
    expect(out).toMatchObject({ found: true, origin: 'off', food: { id: 'food-off' } });
  });

  it('3) OFF não tem → grava o cache negativo e devolve não encontrado', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue(null);
    off.lookup.mockResolvedValue({ status: 'missing' });

    expect(await service.lookupBarcode(CODE)).toEqual({ found: false, code: CODE });
    expect(prisma.barcodeMiss.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: CODE } }));
  });

  it('falha passageira no OFF → não encontrado, mas SEM cache negativo', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue(null);
    off.lookup.mockResolvedValue({ status: 'error' });

    expect(await service.lookupBarcode(CODE)).toEqual({ found: false, code: CODE });
    expect(prisma.barcodeMiss.upsert).not.toHaveBeenCalled();
  });

  it('dois scans simultâneos: se o outro salvou antes (P2002), usa o registro existente', async () => {
    const { prisma, off, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.barcodeMiss.findUnique.mockResolvedValue(null);
    off.lookup.mockResolvedValue({ status: 'found', product });
    prisma.food.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' }),
    );
    prisma.food.findUniqueOrThrow.mockResolvedValue(offFood);

    const out = await service.lookupBarcode(CODE);
    expect(out).toMatchObject({ found: true, food: { id: 'food-off' } });
  });
});

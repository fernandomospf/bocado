import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { FoodSource, FoodStatus, Prisma } from '@prisma/client';
import { FoodsService, REPORTS_TO_HIDE } from './foods.service';

const CODE = '7891000100080';
const dto = {
  barcode: CODE,
  name: 'Biscoito de chocolate recheado',
  brand: 'Marca X',
  per100: { kcal: 480, protein: 6.5, carbs: 68, fat: 20 },
  serving: { grams: 30, label: '30 g (6 biscoitos)' },
};

const product = (over: Record<string, unknown> = {}) => ({
  id: 'food-1',
  name: 'Biscoito de chocolate recheado',
  displayName: null,
  brand: 'Marca X',
  barcode: CODE,
  source: FoodSource.LABEL,
  status: FoodStatus.ACTIVE,
  reportCount: 0,
  kcal100: 480,
  protein100: 6.5,
  carbs100: 68,
  fat100: 20,
  portionGrams: null,
  portionLabel: null,
  servingGrams: 30,
  servingLabel: '30 g (6 biscoitos)',
  ...over,
});

function setup() {
  const prisma = {
    food: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
    foodReport: { findUnique: jest.fn(), create: jest.fn(), count: jest.fn(), deleteMany: jest.fn() },
    foodConfirmation: { deleteMany: jest.fn() },
    barcodeMiss: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: typeof prisma) => unknown) => fn(prisma));
  return { prisma, service: new FoodsService(prisma as never, {} as never, {} as never) };
}

describe('FoodsService.createProduct', () => {
  it('salva como LABEL compartilhado, com o contribuidor e a porção do rótulo', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.food.create.mockResolvedValue(product());

    const out = await service.createProduct('user-1', dto);

    const data = prisma.food.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      source: FoodSource.LABEL,
      userId: null,
      contributedById: 'user-1',
      barcode: CODE,
      searchName: 'biscoito de chocolate recheado marca x',
      servingGrams: 30,
      status: FoodStatus.ACTIVE,
    });
    expect(prisma.barcodeMiss.deleteMany).toHaveBeenCalledWith({ where: { code: CODE } });
    expect(out).toMatchObject({ origin: 'label', brand: 'Marca X', portion: { grams: 30 } });
  });

  it('código já ativo no acervo → 409 com o produto existente', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product({ source: FoodSource.OFF }));

    const err = (await service.createProduct('user-1', dto).catch((e) => e)) as ConflictException;
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ statusCode: 409, product: { id: 'food-1', origin: 'off' } });
    expect(prisma.food.create).not.toHaveBeenCalled();
  });

  it('código de produto denunciado → a contribuição substitui os dados, reativa e apaga as denúncias antigas', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product({ status: FoodStatus.REPORTED, reportCount: 3 }));
    prisma.food.update.mockResolvedValue(product());

    await service.createProduct('user-2', dto);

    expect(prisma.foodReport.deleteMany).toHaveBeenCalledWith({ where: { foodId: 'food-1' } });
    expect(prisma.food.update.mock.calls[0][0].data).toMatchObject({ status: FoodStatus.ACTIVE, reportCount: 0, contributedById: 'user-2' });
  });

  it('dois salvamentos simultâneos (P2002) → 409 com o que foi salvo primeiro', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(null);
    prisma.food.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }));
    prisma.food.findUniqueOrThrow.mockResolvedValue(product());
    await expect(service.createProduct('user-1', dto)).rejects.toBeInstanceOf(ConflictException);
  });

  it('recusa código inválido e macros acima de 100 g', async () => {
    const { service } = setup();
    await expect(service.createProduct('user-1', { ...dto, barcode: '123' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createProduct('user-1', { ...dto, per100: { kcal: 500, protein: 40, carbs: 50, fat: 20 } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('produto sem código de barras também entra no acervo', async () => {
    const { prisma, service } = setup();
    prisma.food.create.mockResolvedValue(product({ barcode: null }));
    await service.createProduct('user-1', { ...dto, barcode: undefined });
    expect(prisma.food.findUnique).not.toHaveBeenCalled();
    expect(prisma.food.create.mock.calls[0][0].data.barcode).toBeNull();
  });
});

describe('FoodsService.report', () => {
  it(`com ${REPORTS_TO_HIDE} usuários diferentes o produto vira REPORTED (sai da busca)`, async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product({ reportCount: 2 }));
    prisma.foodReport.findUnique.mockResolvedValue(null);
    prisma.foodReport.count.mockResolvedValue(3);

    const out = await service.report('user-3', 'food-1', 'Calorias erradas');

    expect(prisma.foodReport.create).toHaveBeenCalledWith({ data: { foodId: 'food-1', userId: 'user-3', reason: 'Calorias erradas' } });
    expect(prisma.food.update).toHaveBeenCalledWith({ where: { id: 'food-1' }, data: { reportCount: 3, status: FoodStatus.REPORTED, verifyCount: 0 } });
    expect(out).toEqual({ reportCount: 3, status: FoodStatus.REPORTED, alreadyReported: false });
  });

  it('com menos de 3, continua ativo', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product());
    prisma.foodReport.findUnique.mockResolvedValue(null);
    prisma.foodReport.count.mockResolvedValue(1);
    const out = await service.report('user-1', 'food-1', 'Porção errada');
    expect(out.status).toBe(FoodStatus.ACTIVE);
  });

  it('a mesma pessoa denunciando de novo não conta duplicado', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product({ reportCount: 2 }));
    prisma.foodReport.findUnique.mockResolvedValue({ id: 'r1' });

    const out = await service.report('user-1', 'food-1', 'De novo');
    expect(out).toEqual({ reportCount: 2, status: FoodStatus.ACTIVE, alreadyReported: true });
    expect(prisma.foodReport.create).not.toHaveBeenCalled();
  });

  it('só produtos do acervo podem ser denunciados (TACO e alimentos próprios não)', async () => {
    const { prisma, service } = setup();
    prisma.food.findUnique.mockResolvedValue(product({ source: FoodSource.TACO }));
    await expect(service.report('user-1', 'food-1', 'Errado')).rejects.toBeInstanceOf(NotFoundException);
  });
});

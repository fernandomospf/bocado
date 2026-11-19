import { BadRequestException } from '@nestjs/common';
import { formatDay } from '../common/dates';
import { addDays } from '../weight/weight.math';
import { MealsService } from './meals.service';

const TODAY = formatDay(new Date());

function setup(last: string | null) {
  const prisma = { meal: { findFirst: jest.fn().mockResolvedValue(last ? { date: new Date(`${last}T00:00:00.000Z`) } : null) } };
  return { prisma, service: new MealsService(prisma as never, {} as never) };
}

describe('MealsService.lastLog (retorno sem culpa)', () => {
  it('devolve os dias desde o último registro, só com refeições com alimentos e da própria pessoa', async () => {
    const { service, prisma } = setup(addDays(TODAY, -5));
    expect(await service.lastLog('user-1', TODAY)).toEqual({ lastLogDate: addDays(TODAY, -5), daysSinceLastLog: 5 });
    const where = prisma.meal.findFirst.mock.calls[0][0].where;
    expect(where.userId).toBe('user-1');
    expect(where.items).toEqual({ some: {} });
  });
  it('registrou hoje = 0 dias', async () => {
    const { service } = setup(TODAY);
    expect((await service.lastLog('user-1', TODAY)).daysSinceLastLog).toBe(0);
  });
  it('conta nova (nunca registrou) = nulo, sem "retorno"', async () => {
    const { service } = setup(null);
    expect(await service.lastLog('user-1', TODAY)).toEqual({ lastLogDate: null, daysSinceLastLog: null });
  });
  it('recusa um "hoje" no futuro', async () => {
    const { service } = setup(null);
    await expect(service.lastLog('user-1', addDays(TODAY, 3))).rejects.toBeInstanceOf(BadRequestException);
  });
});

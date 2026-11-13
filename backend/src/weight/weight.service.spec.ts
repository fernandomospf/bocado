import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WeightService } from './weight.service';

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function setup() {
  const prisma = {
    weightEntry: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    profile: { updateMany: jest.fn(), findUnique: jest.fn() },
  };
  return { prisma, service: new WeightService(prisma as never) };
}

describe('WeightService.save (upsert do dia)', () => {
  it('registrar de novo no mesmo dia atualiza o registro existente, pela chave (userId, date)', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.upsert.mockResolvedValue({ date: day('2026-11-10'), weightKg: 94.5, note: null });
    prisma.weightEntry.findFirst.mockResolvedValue({ date: day('2026-11-10'), weightKg: 94.5 });

    await service.save('user-1', '2026-11-10', { weightKg: 94.5 });

    expect(prisma.weightEntry.upsert).toHaveBeenCalledWith({
      where: { userId_date: { userId: 'user-1', date: day('2026-11-10') } },
      create: { userId: 'user-1', date: day('2026-11-10'), weightKg: 94.5, note: null },
      update: { weightKg: 94.5 },
    });
  });

  it('nota vazia apaga a nota; nota ausente preserva a existente', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.upsert.mockResolvedValue({ date: day('2026-11-10'), weightKg: 94.5, note: null });
    prisma.weightEntry.findFirst.mockResolvedValue(null);

    await service.save('user-1', '2026-11-10', { weightKg: 94.5, note: '' });
    expect(prisma.weightEntry.upsert.mock.calls[0][0].update).toEqual({ weightKg: 94.5, note: null });

    await service.save('user-1', '2026-11-10', { weightKg: 94.5, note: 'depois do treino' });
    expect(prisma.weightEntry.upsert.mock.calls[1][0].update).toEqual({ weightKg: 94.5, note: 'depois do treino' });
  });

  it('atualiza o peso do perfil com o registro mais recente (sem mexer nas metas)', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.upsert.mockResolvedValue({ date: day('2026-10-01'), weightKg: 99, note: null });
    // Registro editado é antigo; o mais recente continua sendo outro
    prisma.weightEntry.findFirst.mockResolvedValue({ date: day('2026-11-10'), weightKg: 94.5 });

    await service.save('user-1', '2026-10-01', { weightKg: 99 });

    expect(prisma.profile.updateMany).toHaveBeenCalledWith({ where: { userId: 'user-1' }, data: { weightKg: 94.5 } });
  });

  it('recusa data no futuro', async () => {
    const { service } = setup();
    await expect(service.save('user-1', '2999-01-01', { weightKg: 80 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('WeightService.remove (posse)', () => {
  it('só apaga o registro do próprio usuário', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.deleteMany.mockResolvedValue({ count: 1 });
    prisma.weightEntry.findFirst.mockResolvedValue(null);

    await service.remove('user-1', '2026-11-10');

    expect(prisma.weightEntry.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', date: day('2026-11-10') },
    });
  });

  it('responde 404 quando o registro não existe ou é de outro usuário', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('user-1', '2026-11-10')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.profile.updateMany).not.toHaveBeenCalled();
  });
});

describe('WeightService.list e summary (posse)', () => {
  it('consulta só os registros do usuário', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.findMany.mockResolvedValue([]);
    await service.list('user-1', '2026-11-01', '2026-11-30');
    expect(prisma.weightEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: 'user-1' }) }),
    );
  });

  it('recusa intervalo maior que 366 dias', async () => {
    const { service } = setup();
    await expect(service.list('user-1', '2025-01-01', '2026-11-30')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marca metas desatualizadas pela tendência', async () => {
    const { prisma, service } = setup();
    prisma.weightEntry.findFirst
      .mockResolvedValueOnce({ date: day('2026-11-10'), weightKg: 92 }) // mais recente
      .mockResolvedValueOnce(null); // sem referência de 30 dias
    prisma.profile.findUnique.mockResolvedValue({ targetsWeightKg: 94.5 });
    prisma.weightEntry.findMany.mockResolvedValue([
      { date: day('2026-11-08'), weightKg: 92.5 },
      { date: day('2026-11-10'), weightKg: 92 },
    ]);

    const s = await service.summary('user-1');

    expect(s.trendKg).toBe(92.25);
    expect(s.targetsOutdated).toBe(true); // |92,25 − 94,5| = 2,25
    expect(prisma.profile.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1' } }));
  });
});

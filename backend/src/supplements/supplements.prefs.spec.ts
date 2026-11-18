import { ForbiddenException } from '@nestjs/common';
import { ProfileService } from '../profile/profile.service';
import { fakePrisma } from '../testing/supplements-fake';
import { assertSupplementsAccess } from './supplements.guard';

const born = (yearsAgo: number) => new Date(Date.UTC(new Date().getUTCFullYear() - yearsAgo, 0, 1));

function profileService(birthDate: Date, over: Record<string, unknown> = {}) {
  const existing = { birthDate, workoutEstimateEnabled: true, workoutAddToGoal: false, ...over };
  const prisma = {
    profile: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(async ({ data }) => ({
        birthDate,
        sex: 'FEMALE',
        heightCm: 165,
        weightKg: 70,
        activityLevel: 'MODERATE',
        goal: 'MAINTAIN',
        kcalTarget: 1800,
        proteinTarget: 120,
        carbsTarget: 180,
        fatTarget: 60,
        weekStartsOn: 'MONDAY',
        supplementsEnabled: false,
        supplementsMaskNamesOnHome: false,
        ...data,
      })),
    },
  };
  return { prisma, service: new ProfileService(prisma as never) };
}

describe('preferências: suplementos e medicações', () => {
  it('adulto liga e desliga; o nome genérico na Hoje é uma preferência à parte; vêm em GET /profile', async () => {
    const { service, prisma } = profileService(born(30));
    const on = await service.updatePreferences('u', { supplementsEnabled: true });
    expect(prisma.profile.update.mock.calls[0][0].data).toEqual({ supplementsEnabled: true });
    expect(on).toMatchObject({ supplementsEnabled: true, supplementsMaskNamesOnHome: false });
    const mask = await service.updatePreferences('u', { supplementsMaskNamesOnHome: true });
    expect(mask.supplementsMaskNamesOnHome).toBe(true);
    await expect(service.updatePreferences('u', { supplementsEnabled: false })).resolves.toMatchObject({ supplementsEnabled: false });
  });

  it('menor de 18 anos não consegue ligar (403 neutro) e nada é gravado; desligar continua permitido', async () => {
    const { service, prisma } = profileService(born(15));
    await expect(service.updatePreferences('u', { supplementsEnabled: true })).rejects.toThrow('Este recurso não está disponível para menores de 18 anos.');
    await expect(service.updatePreferences('u', { supplementsEnabled: true })).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.profile.update).not.toHaveBeenCalled();
    await expect(service.updatePreferences('u', { supplementsEnabled: false })).resolves.toBeDefined();
  });

  it('18 anos completos já pode; um dia antes ainda não', async () => {
    const today = new Date();
    const turning18Tomorrow = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate() + 1));
    const turned18Today = new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate()));
    await expect(profileService(turning18Tomorrow).service.updatePreferences('u', { supplementsEnabled: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(profileService(turned18Today).service.updatePreferences('u', { supplementsEnabled: true })).resolves.toBeDefined();
  });
});

describe('assertSupplementsAccess (a regra do guard)', () => {
  const run = (profile: Record<string, unknown> | null, id = 'u') => {
    const { setProfile, prisma } = fakePrisma();
    if (profile) setProfile(id, profile);
    return assertSupplementsAccess(prisma as never, id);
  };
  it('adulto com o módulo ligado passa', async () => expect(run({})).resolves.toBeUndefined());
  it('desligado, sem perfil ou menor de 18 (mesmo com a flag ligada no banco): 403', async () => {
    await expect(run({ supplementsEnabled: false })).rejects.toThrow('Este recurso não está ativado.');
    await expect(run(null)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ birthDate: born(15), supplementsEnabled: true })).rejects.toThrow('menores de 18 anos');
  });
});

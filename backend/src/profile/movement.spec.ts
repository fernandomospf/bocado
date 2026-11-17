import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreferencesDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

const errorsOf = (plain: object) => validate(plainToInstance(PreferencesDto, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('PreferencesDto.movementGoalMin', () => {
  it.each([30, 150, 155, 600])('aceita %d', async (v) => expect(await errorsOf({ movementGoalMin: v })).toHaveLength(0));
  it('aceita null (limpa a meta) e é opcional', async () => {
    expect(await errorsOf({ movementGoalMin: null })).toHaveLength(0);
    expect(await errorsOf({})).toHaveLength(0);
  });
  it.each([25, 29, 601, 605, 0, -5, 152, 150.5, '150', true])('rejeita %j', async (v) =>
    expect((await errorsOf({ movementGoalMin: v })).length).toBeGreaterThan(0),
  );
  it('movementEnabled aceita booleano e rejeita null/texto', async () => {
    expect(await errorsOf({ movementEnabled: false })).toHaveLength(0);
    for (const v of [null, 'sim', 1]) expect((await errorsOf({ movementEnabled: v })).length).toBeGreaterThan(0);
  });
});

describe('ProfileService: meta de movimento', () => {
  const year = new Date().getUTCFullYear();
  const body = (birthDate: string) => ({ sex: 'FEMALE', birthDate, heightCm: 165, weightKg: 60, activityLevel: 'LIGHT', goal: 'MAINTAIN' }) as never;
  const setup = () => {
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create }) => ({ movementEnabled: true, movementGoalMin: 150, updatedAt: new Date(), ...create })),
      },
    };
    return { prisma, service: new ProfileService(prisma as never) };
  };

  it('menor de 18 anos: a conta nova nasce sem meta padrão (null)', async () => {
    const { service, prisma } = setup();
    await service.save('u', body(`${year - 15}-01-01`));
    expect(prisma.profile.upsert.mock.calls[0][0].create.movementGoalMin).toBeNull();
  });

  it('adulto: não define o campo (vale o padrão de 150 do banco) e a atualização não mexe na meta', async () => {
    const { service, prisma } = setup();
    await service.save('u', body(`${year - 30}-01-01`));
    const call = prisma.profile.upsert.mock.calls[0][0];
    expect('movementGoalMin' in call.create).toBe(false);
    expect('movementGoalMin' in call.update).toBe(false);
  });
});

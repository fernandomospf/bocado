import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreferencesDto } from './dto/profile.dto';
import { ProfileService } from './profile.service';

const errorsOf = (plain: object) => validate(plainToInstance(PreferencesDto, plain), { whitelist: true, forbidNonWhitelisted: true });

describe('PreferencesDto.movementDailyGoalMin', () => {
  it.each([15, 20, 30, 235, 240])('aceita %d', async (v) => expect(await errorsOf({ movementDailyGoalMin: v })).toHaveLength(0));
  it('aceita null (limpa a meta) e é opcional', async () => {
    expect(await errorsOf({ movementDailyGoalMin: null })).toHaveLength(0);
    expect(await errorsOf({})).toHaveLength(0);
  });
  it.each([10, 14, 245, 300, 0, -5, 32, 31, 30.5, '30', true])('rejeita %j', async (v) =>
    expect((await errorsOf({ movementDailyGoalMin: v })).length).toBeGreaterThan(0),
  );
  it('movementEnabled aceita booleano e rejeita null/texto', async () => {
    expect(await errorsOf({ movementEnabled: false })).toHaveLength(0);
    for (const v of [null, 'sim', 1]) expect((await errorsOf({ movementEnabled: v })).length).toBeGreaterThan(0);
  });
});

describe('PreferencesDto.movementRestDays', () => {
  it.each([[[]], [[0]], [[6, 0]], [[0, 1, 2, 3, 4, 5, 6]]])('aceita %j', async (v) =>
    expect(await errorsOf({ movementRestDays: v })).toHaveLength(0),
  );
  it.each([[[7]], [[-1]], [[0, 0]], [[1.5]], [['1']], [null], ['0'], [[0, 1, 2, 3, 4, 5, 6, 6]]])('rejeita %j', async (v) =>
    expect((await errorsOf({ movementRestDays: v })).length).toBeGreaterThan(0),
  );
});

describe('ProfileService: meta de movimento', () => {
  const year = new Date().getUTCFullYear();
  const body = (birthDate: string) => ({ sex: 'FEMALE', birthDate, heightCm: 165, weightKg: 60, activityLevel: 'LIGHT', goal: 'MAINTAIN' }) as never;
  const stored = { movementEnabled: true, movementDailyGoalMin: 30, movementRestDays: [], updatedAt: new Date() };
  const setup = () => {
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(async ({ create }) => ({ ...stored, ...create })),
      },
    };
    return { prisma, service: new ProfileService(prisma as never) };
  };

  it('menor de 18 anos: a conta nova nasce sem meta diária (null)', async () => {
    const { service, prisma } = setup();
    const res = await service.save('u', body(`${year - 15}-01-01`));
    expect(prisma.profile.upsert.mock.calls[0][0].create.movementDailyGoalMin).toBeNull();
    expect(res.movementDailyGoalMin).toBeNull();
  });

  it('adulto: não define o campo (vale o padrão de 30 do banco) e a atualização não mexe na meta', async () => {
    const { service, prisma } = setup();
    const res = await service.save('u', body(`${year - 30}-01-01`));
    const call = prisma.profile.upsert.mock.calls[0][0];
    expect('movementDailyGoalMin' in call.create).toBe(false);
    expect('movementDailyGoalMin' in call.update).toBe(false);
    expect(res).toMatchObject({ movementDailyGoalMin: 30, movementRestDays: [] });
  });

  it('PATCH de preferências grava a meta diária e os descansos (ordenados)', async () => {
    const prisma = {
      profile: {
        findUnique: jest.fn().mockResolvedValue({ birthDate: new Date('1990-01-01'), workoutEstimateEnabled: true, workoutAddToGoal: false }),
        update: jest.fn().mockImplementation(async ({ data }) => ({ birthDate: new Date('1990-01-01'), weekStartsOn: 'MONDAY', ...stored, ...data })),
      },
    };
    const service = new ProfileService(prisma as never);
    const res = await service.updatePreferences('u', { movementDailyGoalMin: 45, movementRestDays: [6, 0] });
    expect(prisma.profile.update.mock.calls[0][0].data).toEqual({ movementDailyGoalMin: 45, movementRestDays: [0, 6] });
    expect(res).toMatchObject({ movementDailyGoalMin: 45, movementRestDays: [0, 6] });
  });
});

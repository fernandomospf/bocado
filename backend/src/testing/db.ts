import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Testes com banco real. Só rodam com TEST_DATABASE_URL apontando para um banco descartável
 * (o nome precisa terminar em _test ou conter _dev_); nunca usam DATABASE_URL e se recusam a rodar contra
 * qualquer outro banco, para não encostar nos dados do app.
 */
const url = process.env.TEST_DATABASE_URL;
const dbName = url ? new URL(url).pathname.replace(/^\//, '') : '';
export const dbTestsEnabled = !!url && /(_test$|_dev_)/.test(dbName);

export const describeDb = dbTestsEnabled ? describe : describe.skip;

export function createTestPrisma(): PrismaService {
  if (!dbTestsEnabled) throw new Error('TEST_DATABASE_URL ausente ou fora do padrão de banco descartável');
  return new PrismaClient({ datasources: { db: { url } } }) as unknown as PrismaService;
}

let seq = 0;
export async function makeUser(prisma: PrismaService, name = 'Pessoa') {
  seq += 1;
  return prisma.user.create({
    data: { email: `t${Date.now()}-${seq}@teste.local`, name: `${name} ${seq}`, avatarUrl: `https://img.test/${seq}.png` },
  });
}

/** Limpeza entre testes: apaga o que os testes criam, na ordem das dependências. */
export async function cleanDb(prisma: PrismaService) {
  await prisma.aiUsage.deleteMany();
  await prisma.waitlistEntry.deleteMany();
  await prisma.betaInvite.deleteMany();
  await prisma.householdInvite.deleteMany();
  await prisma.household.deleteMany();
  await prisma.user.deleteMany({ where: { email: { endsWith: '@teste.local' } } });
}

import type { PrismaService } from '../prisma/prisma.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { ExportService, FASTING_HEADER, WELLBEING_HEADER } from './export.service';

async function collect(gen: AsyncGenerator<string>) {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

/** Banco real: jejum e bem-estar saem só em arquivos à parte, só da própria pessoa, com horários em UTC. */
describeDb('Exportação de jejum e bem-estar (banco real)', () => {
  let prisma: PrismaService;
  let exports: ExportService;
  beforeAll(() => {
    prisma = createTestPrisma();
    exports = new ExportService(prisma);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  it('jejum: cabeçalho, horários em UTC, duração e isolamento entre pessoas', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    await prisma.fastingSession.create({
      data: { userId: a.id, startedAt: new Date('2026-11-18T20:00:00Z'), endedAt: new Date('2026-11-19T07:20:00Z'), targetHours: 16, note: 'ok' },
    });
    await prisma.fastingSession.create({ data: { userId: b.id, startedAt: new Date('2026-11-18T21:00:00Z'), targetHours: 14 } });

    const csv = await collect(exports.fastingCsv(a.id, '2026-11-15', '2026-11-19'));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain(FASTING_HEADER.join(';'));
    expect(csv).toContain('18/11/2026 20:00;19/11/2026 07:20;16;680;ok');
    expect(csv).not.toContain('21:00'); // a sessão da outra pessoa nunca aparece
    expect(await exports.fastingSummary(a.id, '2026-11-15', '2026-11-19')).toMatchObject({ fasting: 1 });
    expect(await exports.fastingSummary(b.id, '2026-11-15', '2026-11-19')).toMatchObject({ fasting: 1 });
  });

  it('bem-estar: rótulos das escalas, nota protegida e isolamento', async () => {
    const a = await makeUser(prisma);
    const b = await makeUser(prisma);
    await prisma.wellbeingLog.create({ data: { userId: a.id, date: new Date('2026-11-18T00:00:00Z'), nausea: 1, appetite: 0, energy: 3, gi: null, note: '=cmd' } });
    await prisma.wellbeingLog.create({ data: { userId: b.id, date: new Date('2026-11-18T00:00:00Z'), nausea: 3, note: 'privado de b' } });

    const csv = await collect(exports.wellbeingCsv(a.id, '2026-11-15', '2026-11-19'));
    expect(csv).toContain(WELLBEING_HEADER.join(';'));
    expect(csv).toContain("18/11/2026;Leve;Nenhum;Alta;;'=cmd");
    expect(csv).not.toContain('privado de b');
    expect(await exports.wellbeingSummary(a.id, '2026-11-15', '2026-11-19')).toMatchObject({ wellbeing: 1 });
  });

  it('o resumo padrão não conta jejum nem bem-estar (nunca saem sem pedir)', async () => {
    const a = await makeUser(prisma);
    await prisma.wellbeingLog.create({ data: { userId: a.id, date: new Date('2026-11-18T00:00:00Z'), nausea: 1 } });
    const summary = await exports.summary(a.id, '2026-11-15', '2026-11-19');
    expect(JSON.stringify(summary)).not.toMatch(/fasting|wellbeing/);
  });
});

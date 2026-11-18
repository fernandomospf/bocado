import { ExportService } from '../export/export.service';
import { fakePrisma } from '../testing/supplements-fake';
import { SupplementsService } from './supplements.service';
import { addDays } from '../weight/weight.math';
import { latestAllowedDay } from '../meals/meals.service';

const U = 'user-a';
const day = (n: number) => addDays(latestAllowedDay(), -n);

async function csv(svc: ExportService, from: string, to: string) {
  let out = '';
  for await (const c of svc.supplementsCsv(U, from, to)) out += c;
  return out;
}

describe('exportação CSV de suplementos e medicações', () => {
  it('data; item; dose; unidade; status; local, com o nome real, a dose da época e a vírgula decimal', async () => {
    const { prisma } = fakePrisma();
    const supplements = new SupplementsService(prisma as never);
    const inj = await supplements.createPlan(U, { name: 'Injetável semanal', category: 'MEDICATION', administration: 'INJECTION', doseAmount: 0.5, doseUnit: 'ML', scheduleType: 'DAILY', startDate: '2026-10-01', trackSite: true } as never);
    const other = await supplements.createPlan(U, { name: '=SOMA(A1)', category: 'SUPPLEMENT', doseAmount: 2.25, doseUnit: 'OTHER', doseUnitLabel: 'gotas; 2x', scheduleType: 'DAILY', startDate: '2026-10-01' } as never);
    await supplements.log(U, { planId: inj.id, date: day(2), site: 'THIGH_L' } as never);
    await supplements.skip(U, { planId: inj.id, date: day(1) } as never);
    await supplements.log(U, { planId: other.id, date: day(2) } as never);
    await supplements.updatePlan(U, inj.id, { doseAmount: 9 } as never); // depois da edição, o histórico segue com 0,5

    const text = await csv(new ExportService(prisma as never), day(5), day(0));
    const [d2, d1] = [day(2), day(1)].map((d) => d.split('-').reverse().join('/'));
    expect(text).toBe(
      '﻿Data;Item;Dose;Unidade;Status;Local\r\n' +
        `${d2};Injetável semanal;0,5;ml;Registrado;Coxa esquerda\r\n` +
        `${d2};'=SOMA(A1);2,25;"gotas; 2x";Registrado;\r\n` + // sem injeção de fórmula; unidade livre com ";" escapada
        `${d1};Injetável semanal;0,5;ml;Pulado;\r\n`,
    );
  });

  it('só os registros do usuário e do período', async () => {
    const { prisma } = fakePrisma();
    const s = new SupplementsService(prisma as never);
    const mine = await s.createPlan(U, { name: 'Meu', category: 'VITAMIN', doseAmount: 1, doseUnit: 'MG', scheduleType: 'DAILY', startDate: '2026-10-01' } as never);
    const theirs = await s.createPlan('user-b', { name: 'Do outro', category: 'VITAMIN', doseAmount: 1, doseUnit: 'MG', scheduleType: 'DAILY', startDate: '2026-10-01' } as never);
    await s.log(U, { planId: mine.id, date: day(2) } as never);
    await s.log(U, { planId: mine.id, date: day(20) } as never); // fora do período
    await s.log('user-b', { planId: theirs.id, date: day(2) } as never);
    const text = await csv(new ExportService(prisma as never), day(5), day(0));
    expect(text).toContain('Meu');
    expect(text).not.toContain('Do outro');
    expect(text.split('\r\n').filter(Boolean)).toHaveLength(2); // cabeçalho + 1
  });
});

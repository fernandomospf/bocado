import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { latestAllowedDay } from '../meals/meals.service';
import { fakePrisma } from '../testing/supplements-fake';
import { addDays } from '../weight/weight.math';
import { SupplementsService } from './supplements.service';

const U = 'user-a';
const V = 'user-b';
const TODAY = '2026-11-18'; // quarta-feira (3)

const weekly = {
  name: 'Injetável semanal',
  category: 'MEDICATION' as const,
  administration: 'INJECTION' as const,
  doseAmount: 0.5,
  doseUnit: 'ML' as const,
  scheduleType: 'WEEKDAYS' as const,
  weekdays: [1], // segunda
  startDate: '2026-10-01',
  trackSite: true,
};
const daily = {
  name: 'Vitamina D',
  category: 'VITAMIN' as const,
  doseAmount: 2000,
  doseUnit: 'UI' as const,
  scheduleType: 'DAILY' as const,
  startDate: '2026-10-01',
};

function setup() {
  const fake = fakePrisma();
  return { ...fake, service: new SupplementsService(fake.prisma as never) };
}
const recent = (daysAgo: number) => addDays(latestAllowedDay(), -daysAgo);

describe('planos', () => {
  it('cria com padrões (oral, "qualquer hora", sem marcador) e normaliza o que depende de outros campos', async () => {
    const { service } = setup();
    const p = await service.createPlan(U, { ...daily, notes: '  com o café  ' } as never);
    expect(p).toMatchObject({ name: 'Vitamina D', administration: 'ORAL', slots: ['ANY'], trackSite: false, showOnWeightChart: false, notes: 'com o café', archived: false });
    // trackSite só vale para injetável; unidade "Outro" exige o texto; dias da semana exigem ao menos um
    const inj = await service.createPlan(U, { ...daily, name: 'X', administration: 'ORAL', trackSite: true } as never);
    expect(inj.trackSite).toBe(false);
    await expect(service.createPlan(U, { ...daily, doseUnit: 'OTHER' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPlan(U, { ...daily, scheduleType: 'WEEKDAYS', weekdays: [] } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPlan(U, { ...daily, scheduleType: 'EVERY_N_DAYS' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createPlan(U, { ...daily, endDate: '2026-09-01' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('limite de 30 itens ativos (409); arquivar libera vaga, desarquivar respeita o limite', async () => {
    const { service } = setup();
    const created = [];
    for (let i = 0; i < 30; i++) created.push(await service.createPlan(U, { ...daily, name: `Item ${i}` } as never));
    await expect(service.createPlan(U, { ...daily, name: 'Item 31' } as never)).rejects.toBeInstanceOf(ConflictException);
    // outro usuário não é afetado
    await expect(service.createPlan(V, daily as never)).resolves.toBeDefined();
    await service.archive(U, created[0].id);
    const extra = await service.createPlan(U, { ...daily, name: 'Novo' } as never);
    expect(extra.archived).toBe(false);
    await expect(service.unarchive(U, created[0].id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('listar devolve a próxima dose de cada plano ativo (arquivado: nenhuma)', async () => {
    const { service } = setup();
    const a = await service.createPlan(U, weekly as never);
    const b = await service.createPlan(U, daily as never);
    await service.archive(U, b.id);
    const { plans } = await service.listPlans(U, { today: TODAY });
    expect(plans.find((p) => p.id === a.id)!.nextDate).toBe('2026-11-23'); // próxima segunda
    expect(plans.find((p) => p.id === b.id)!.nextDate).toBeNull();
  });

  it('editar a dose do plano NÃO altera o histórico (snapshot da dose da época)', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, { ...daily, doseAmount: 0.25, doseUnit: 'ML' } as never);
    const first = await service.log(U, { planId: plan.id, date: recent(1) } as never);
    await service.updatePlan(U, plan.id, { doseAmount: 1, doseUnit: 'MG' } as never);
    const second = await service.log(U, { planId: plan.id, date: recent(0) } as never);
    const { logs } = await service.history(U, { from: recent(3), to: recent(0) });
    const byId = new Map(logs.map((l) => [l.id, l]));
    expect(byId.get(first.id)).toMatchObject({ doseAmount: 0.25, doseUnit: 'ML' });
    expect(byId.get(second.id)).toMatchObject({ doseAmount: 1, doseUnit: 'MG' });
  });

  it('apagar o plano remove o histórico; arquivar mantém', async () => {
    const { service, logs } = setup();
    const a = await service.createPlan(U, daily as never);
    const b = await service.createPlan(U, { ...daily, name: 'Outro' } as never);
    await service.log(U, { planId: a.id, date: recent(0) } as never);
    await service.log(U, { planId: b.id, date: recent(0) } as never);
    await service.archive(U, a.id);
    expect(logs).toHaveLength(2); // arquivar mantém
    expect((await service.history(U, { planId: a.id, from: recent(2), to: recent(0) })).logs).toHaveLength(1);
    await service.deletePlan(U, b.id);
    expect(logs).toHaveLength(1); // apagar leva o histórico do plano
    expect(logs[0].planId).toBe(a.id);
    await expect(service.deletePlan(U, b.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('registro de dose', () => {
  it('registra com a dose do plano por padrão, ou a informada só neste registro', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, weekly as never);
    const a = await service.log(U, { planId: plan.id, date: recent(1), site: 'THIGH_L', note: ' ok ' } as never);
    expect(a).toMatchObject({ status: 'TAKEN', doseAmount: 0.5, doseUnit: 'ML', site: 'THIGH_L', note: 'ok', slot: 'ANY' });
    const b = await service.log(U, { planId: plan.id, date: recent(2), doseAmount: 0.25 } as never);
    expect(b.doseAmount).toBe(0.25);
    expect((await service.createPlan(U, weekly as never)).doseAmount).toBe(0.5); // o plano não mudou
  });

  it('duplicado (mesmo plano, dia e horário) = 409', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, daily as never);
    await service.log(U, { planId: plan.id, date: recent(0) } as never);
    await expect(service.log(U, { planId: plan.id, date: recent(0) } as never)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.skip(U, { planId: plan.id, date: recent(0) } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('data: nada no futuro e nada além de 30 dias; horário precisa ser um dos do plano', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, { ...daily, slots: ['MORNING', 'NIGHT'] } as never);
    await expect(service.log(U, { planId: plan.id, date: addDays(latestAllowedDay(), 1), slot: 'MORNING' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.log(U, { planId: plan.id, date: recent(31), slot: 'MORNING' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.log(U, { planId: plan.id, date: recent(30), slot: 'MORNING' } as never)).resolves.toBeDefined();
    await expect(service.log(U, { planId: plan.id, date: recent(0), slot: 'AFTERNOON' } as never)).rejects.toBeInstanceOf(BadRequestException);
    // sem informar o horário num plano de dois horários: "qualquer hora" não existe nele
    await expect(service.log(U, { planId: plan.id, date: recent(0) } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('local só para injetáveis; plano arquivado não recebe registro', async () => {
    const { service } = setup();
    const oral = await service.createPlan(U, daily as never);
    await expect(service.log(U, { planId: oral.id, date: recent(0), site: 'ABDOMEN_L' } as never)).rejects.toBeInstanceOf(BadRequestException);
    await service.archive(U, oral.id);
    await expect(service.log(U, { planId: oral.id, date: recent(0) } as never)).rejects.toBeInstanceOf(ConflictException);
  });

  it('pular registra SKIPPED (sem horário tomado) e não some do histórico', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, daily as never);
    const s = await service.skip(U, { planId: plan.id, date: recent(1) } as never);
    expect(s).toMatchObject({ status: 'SKIPPED', takenAt: null, site: null });
    expect((await service.history(U, { from: recent(5), to: recent(0) })).logs).toHaveLength(1);
  });

  it('desfazer (DELETE do registro) apaga e libera o mesmo dia e horário', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, daily as never);
    const log = await service.log(U, { planId: plan.id, date: recent(0) } as never);
    await service.deleteLog(U, log.id);
    await expect(service.deleteLog(U, log.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.log(U, { planId: plan.id, date: recent(0) } as never)).resolves.toBeDefined();
  });

  it('editar o registro: local, nota, dose e horário; local só em injetável', async () => {
    const { service } = setup();
    const inj = await service.createPlan(U, weekly as never);
    const oral = await service.createPlan(U, daily as never);
    const l = await service.log(U, { planId: inj.id, date: recent(1) } as never);
    const edited = await service.updateLog(U, l.id, { site: 'GLUTE_R', note: 'ok', doseAmount: 0.4, takenAt: '2026-11-10T09:30:00.000Z' } as never);
    expect(edited).toMatchObject({ site: 'GLUTE_R', note: 'ok', doseAmount: 0.4 });
    expect(new Date(edited.takenAt!).toISOString()).toBe('2026-11-10T09:30:00.000Z');
    expect((await service.updateLog(U, l.id, { site: null, note: null } as never))).toMatchObject({ site: null, note: null });
    const o = await service.log(U, { planId: oral.id, date: recent(1) } as never);
    await expect(service.updateLog(U, o.id, { site: 'THIGH_L' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('o dia', () => {
  it('itens de hoje: pendente → registrado/pulado, com a dose da época e o local', async () => {
    const { service } = setup();
    const day = '2026-11-18';
    const a = await service.createPlan(U, { ...daily, startDate: day, slots: ['MORNING', 'NIGHT'] } as never);
    let res = await service.day(U, day);
    expect(res.items.map((i) => [i.slot, i.status, i.dueDate])).toEqual([
      ['MORNING', 'pending', day],
      ['NIGHT', 'pending', day],
    ]);
    // registra a manhã (hoje) e pula a noite
    await (service as never as { prisma: ReturnType<typeof fakePrisma>['prisma'] }).prisma.intakeLog.create({
      data: { userId: U, planId: a.id, date: new Date(`${day}T00:00:00Z`), slot: 'MORNING', status: 'TAKEN', takenAt: new Date(), doseAmount: 7, doseUnit: 'UI' },
    });
    await (service as never as { prisma: ReturnType<typeof fakePrisma>['prisma'] }).prisma.intakeLog.create({
      data: { userId: U, planId: a.id, date: new Date(`${day}T00:00:00Z`), slot: 'NIGHT', status: 'SKIPPED', doseAmount: 2000, doseUnit: 'UI' },
    });
    res = await service.day(U, day);
    expect(res.items.map((i) => [i.slot, i.status])).toEqual([
      ['MORNING', 'taken'],
      ['NIGHT', 'skipped'],
    ]);
    expect(res.items[0].doseAmount).toBe(7); // a dose registrada, não a do plano
  });

  it('janela de 3 dias: o que ficou sem registro aparece como "unlogged" com o dia original; mais antigo some; registrado não volta', async () => {
    const { service, prisma } = setup();
    const plan = await service.createPlan(U, { ...daily, startDate: '2026-11-01' } as never);
    const at = (d: string) => new Date(`${d}T00:00:00Z`);
    // 14 e 16 sem registro; 15 registrado; 17 pulado
    for (const [d, status] of [['2026-11-15', 'TAKEN'], ['2026-11-17', 'SKIPPED']] as const) {
      await prisma.intakeLog.create({ data: { userId: U, planId: plan.id, date: at(d), slot: 'ANY', status, doseAmount: 2000, doseUnit: 'UI' } });
    }
    const res = await service.day(U, '2026-11-18');
    expect(res.items.map((i) => [i.dueDate, i.status])).toEqual([
      ['2026-11-16', 'unlogged'],
      ['2026-11-18', 'pending'],
    ]);
    // dia 14 (4 dias antes) já ficou só no histórico
    expect(res.items.some((i) => i.dueDate === '2026-11-14')).toBe(false);
  });

  it('plano começando hoje ou no futuro não gera pendência atrás do início', async () => {
    const { service } = setup();
    await service.createPlan(U, { ...daily, startDate: '2026-11-18' } as never);
    const res = await service.day(U, '2026-11-18');
    expect(res.items.map((i) => i.dueDate)).toEqual(['2026-11-18']);
    expect((await service.day(U, '2026-11-17')).items).toEqual([]);
  });

  it('a cada N dias (rolling): a dose registrada move a próxima; o que passou da janela não gera cobrança', async () => {
    const { service, prisma } = setup();
    const plan = await service.createPlan(U, { ...daily, scheduleType: 'EVERY_N_DAYS', intervalDays: 7, startDate: '2026-11-02', administration: 'ORAL' } as never);
    const at = (d: string) => new Date(`${d}T00:00:00Z`);
    // sem registro: previsto no início (dia 2)
    expect((await service.day(U, '2026-11-02')).items.map((i) => i.status)).toEqual(['pending']);
    // registrada no dia 4 → a próxima é 11
    await prisma.intakeLog.create({ data: { userId: U, planId: plan.id, date: at('2026-11-04'), slot: 'ANY', status: 'TAKEN', doseAmount: 1, doseUnit: 'UI' } });
    expect((await service.day(U, '2026-11-09')).items).toEqual([]);
    expect((await service.day(U, '2026-11-11')).items.map((i) => [i.dueDate, i.status])).toEqual([['2026-11-11', 'pending']]);
    // dia 12, 13: a dose do dia 11 segue na janela como "Não registrada"
    expect((await service.day(U, '2026-11-13')).items.map((i) => [i.dueDate, i.status])).toEqual([['2026-11-11', 'unlogged']]);
    // dia 15: já saiu da janela (4 dias): sem cobrança
    expect((await service.day(U, '2026-11-15')).items).toEqual([]);
  });

  it('próximas doses: a partir do dia seguinte, até 7 dias, em ordem; sem o que está fora', async () => {
    const { service } = setup();
    const a = await service.createPlan(U, weekly as never); // segunda
    const b = await service.createPlan(U, { ...daily, name: 'Mensal', scheduleType: 'EVERY_N_DAYS', intervalDays: 30, startDate: '2026-11-01' } as never);
    await service.createPlan(U, { ...daily, name: 'Encerrado', endDate: '2026-11-10' } as never);
    const res = await service.day(U, '2026-11-18');
    expect(res.next).toEqual([{ planId: a.id, name: 'Injetável semanal', nextDate: '2026-11-23' }]);
    expect(res.next.some((n) => n.planId === b.id)).toBe(false);
  });

  it('local sugerido: o seguinte ao último usado, só para injetáveis com rodízio', async () => {
    const { service, prisma } = setup();
    const inj = await service.createPlan(U, weekly as never);
    const oral = await service.createPlan(U, daily as never);
    expect((await service.day(U, '2026-11-18')).suggestedSites).toEqual({ [inj.id]: 'ABDOMEN_L' });
    await prisma.intakeLog.create({ data: { userId: U, planId: inj.id, date: new Date('2026-11-16T00:00:00Z'), slot: 'ANY', status: 'TAKEN', doseAmount: 0.5, doseUnit: 'ML', site: 'THIGH_R' } });
    const res = await service.day(U, '2026-11-18');
    expect(res.suggestedSites[inj.id]).toBe('GLUTE_L');
    expect(res.suggestedSites[oral.id]).toBeUndefined();
  });
});

describe('marcadores do gráfico de peso', () => {
  it('só dos planos marcados e só registros TAKEN, com o nome do plano', async () => {
    const { service } = setup();
    const marked = await service.createPlan(U, { ...weekly, showOnWeightChart: true } as never);
    const plain = await service.createPlan(U, daily as never);
    await service.log(U, { planId: marked.id, date: recent(2) } as never);
    await service.skip(U, { planId: marked.id, date: recent(1) } as never);
    await service.log(U, { planId: plain.id, date: recent(2) } as never);
    const markers = await service.weightMarkers(U, { from: recent(10), to: recent(0) });
    expect(markers).toEqual([{ date: recent(2), planId: marked.id, label: 'Injetável semanal' }]);
  });
  it('intervalo máximo de 366 dias; invertido é inválido', async () => {
    const { service } = setup();
    await expect(service.weightMarkers(U, { from: '2025-01-01', to: '2026-11-18' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.weightMarkers(U, { from: '2026-11-18', to: '2026-11-01' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('isolamento: toda consulta é do usuário da sessão', () => {
  it('outro usuário não vê, edita, apaga, registra, arquiva nem exporta o calendário do plano', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, { ...weekly, showOnWeightChart: true } as never);
    const log = await service.log(U, { planId: plan.id, date: recent(1) } as never);

    expect((await service.listPlans(V, {})).plans).toEqual([]);
    expect((await service.day(V, TODAY)).items).toEqual([]);
    expect((await service.history(V, { from: recent(5), to: recent(0) })).logs).toEqual([]);
    expect(await service.weightMarkers(V, { from: recent(5), to: recent(0) })).toEqual([]);
    await expect(service.history(V, { planId: plan.id, from: recent(5), to: recent(0) })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updatePlan(V, plan.id, { name: 'x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deletePlan(V, plan.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.archive(V, plan.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.unarchive(V, plan.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.log(V, { planId: plan.id, date: recent(0) } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.skip(V, { planId: plan.id, date: recent(0) } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateLog(V, log.id, { note: 'x' } as never)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteLog(V, log.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.calendar(V, plan.id, { time: '08:00' } as never)).rejects.toBeInstanceOf(NotFoundException);
    // nada do dono mudou
    expect((await service.listPlans(U, {})).plans).toHaveLength(1);
    expect((await service.history(U, { from: recent(5), to: recent(0) })).logs).toHaveLength(1);
  });
});

describe('calendário', () => {
  it('gera o arquivo do plano do dono: genérico por padrão', async () => {
    const { service } = setup();
    const plan = await service.createPlan(U, { ...weekly, name: 'Nome Secreto' } as never);
    const ics = await service.calendar(U, plan.id, { time: '07:15' } as never);
    expect(ics).toContain('DTSTART:20261005T071500'); // 1ª segunda a partir do início (1/out, quinta)
    expect(ics).toContain('SUMMARY:Lembrete do Bocado');
    expect(ics).not.toMatch(/Nome Secreto|0,5/);
    expect(await service.calendar(U, plan.id, { time: '07:15', title: 'name' } as never)).toContain('SUMMARY:Nome Secreto');
    expect(await service.calendar(U, plan.id, { time: '07:15', dose: '1' } as never)).toContain('0\\,5 ml');
  });
});

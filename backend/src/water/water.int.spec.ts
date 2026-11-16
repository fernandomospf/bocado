/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import 'reflect-metadata';
import { ExportService } from '../export/export.service';
import { PreferencesDto } from '../profile/dto/profile.dto';
import { ProfileService } from '../profile/profile.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from '../reports/reports.service';
import { cleanDb, createTestPrisma, describeDb, makeUser } from '../testing/db';
import { SetWeightGoalDto } from '../weight/dto/weight.dto';
import { LOW_BMI_MESSAGE, UNDER_18_MESSAGE } from '../weight/weight.goal';
import { WeightService } from '../weight/weight.service';
import { WorkoutsService } from '../workouts/workouts.service';
import { AddWaterDto } from './dto/water.dto';
import { WaterService } from './water.service';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const TODAY = shift(0);
const day = (s: string) => new Date(`${s}T00:00:00Z`);

describeDb('Meta de peso e água (banco real)', () => {
  let prisma: PrismaService;
  let water: WaterService;
  let weight: WeightService;
  let workouts: WorkoutsService;
  let profiles: ProfileService;

  beforeAll(() => {
    prisma = createTestPrisma();
    water = new WaterService(prisma);
    weight = new WeightService(prisma, water);
    workouts = new WorkoutsService(prisma, water);
    profiles = new ProfileService(prisma, water);
  });
  afterAll(async () => {
    await cleanDb(prisma);
    await prisma.$disconnect();
  });
  beforeEach(() => cleanDb(prisma));

  async function person(over: Record<string, unknown> = {}, name = 'Ana') {
    const u = await makeUser(prisma, name);
    await prisma.profile.create({
      data: {
        userId: u.id, sex: 'FEMALE', birthDate: new Date('1990-01-01'), heightCm: 170, weightKg: 80,
        activityLevel: 'MODERATE', goal: 'LOSE', kcalTarget: 1800, proteinTarget: 130, carbsTarget: 190, fatTarget: 55, ...over,
      } as any,
    });
    return u;
  }
  const w = (userId: string, date: string, kg: number) => prisma.weightEntry.create({ data: { userId, date: day(date), weightKg: kg } });

  // ======================================================================== meta de peso
  describe('meta de peso', () => {
    it('define a meta: grava o início (tendência atual) e a data, e o resumo traz o progresso', async () => {
      const u = await person();
      for (let i = 6; i >= 0; i--) await w(u.id, shift(-i), 80 - (6 - i) * 0.1); // tendência ~79,7
      const out = await weight.setGoal(u.id, 72);
      const p = await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } });
      expect(p.goalWeightKg).toBe(72);
      expect(p.goalStartWeightKg).toBeCloseTo(79.7, 1);
      expect(iso(p.goalSetAt!)).toBe(TODAY);
      expect(out.goal).toMatchObject({ targetKg: 72, direction: 'down', reached: false });

      const s: any = await weight.summary(u.id);
      expect(s.goal).toMatchObject({ targetKg: 72, startKg: p.goalStartWeightKg, direction: 'down' });
      expect(s.goal.currentKg).toBeCloseTo(79.7, 1);
      expect(s.goal.remainingKg).toBeCloseTo(7.7, 1);
      expect(s.goal.progressPct).toBe(0);
      // a série devolve a meta para a linha do gráfico
      expect((await weight.list(u.id, shift(-30), TODAY)).goalWeightKg).toBe(72);
    });

    it('sem nenhum peso registrado, o início é o peso do perfil', async () => {
      const u = await person({ weightKg: 85 });
      await weight.setGoal(u.id, 80);
      expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).goalStartWeightKg).toBe(85);
      expect((await weight.summary(u.id) as any).goal).toMatchObject({ startKg: 85, currentKg: 85 });
    });

    it('progresso e "chegou perto" nas duas direções, depois de novas pesagens', async () => {
      const down = await person();
      await weight.setGoal(down.id, 75);
      await w(down.id, TODAY, 77.5);
      expect(((await weight.summary(down.id)) as any).goal).toMatchObject({ direction: 'down', reached: false });
      await w(down.id, shift(-1), 75.3);
      await prisma.weightEntry.deleteMany({ where: { userId: down.id, date: day(TODAY) } });
      await w(down.id, TODAY, 75.3);
      const near: any = (await weight.summary(down.id)).goal;
      expect(near.reached).toBe(true); // tendência ~75,3 (média dos dois)

      const up = await person({ goal: 'GAIN', weightKg: 60 }, 'Bia');
      await weight.setGoal(up.id, 66);
      await w(up.id, TODAY, 63);
      const g: any = (await weight.summary(up.id)).goal;
      expect(g).toMatchObject({ direction: 'up', reached: false });
      expect(g.progressPct).toBeCloseTo(50, 0);
    });

    it('valida limites, IMC mínimo e coerência com o objetivo; nada é gravado', async () => {
      const lose = await person();
      await expect(weight.setGoal(lose.id, 53)).rejects.toMatchObject({ status: 422, message: LOW_BMI_MESSAGE });
      await expect(weight.setGoal(lose.id, 85)).rejects.toBeInstanceOf(UnprocessableEntityException); // LOSE com meta acima
      await expect(weight.setGoal(lose.id, 79.8)).rejects.toBeInstanceOf(UnprocessableEntityException); // diferença < 0,5
      const gain = await person({ goal: 'GAIN' }, 'Gain');
      await expect(weight.setGoal(gain.id, 70)).rejects.toBeInstanceOf(UnprocessableEntityException);
      const keep = await person({ goal: 'MAINTAIN' }, 'Keep');
      await expect(weight.setGoal(keep.id, 70)).rejects.toBeInstanceOf(UnprocessableEntityException);
      await expect(weight.setGoal(keep.id, 78.5)).resolves.toBeDefined();
      for (const u of [lose, gain]) expect((await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } })).goalWeightKg).toBeNull();
      // o objetivo do perfil NUNCA muda sozinho
      expect((await prisma.profile.findUniqueOrThrow({ where: { userId: lose.id } })).goal).toBe('LOSE');
    });

    it('DTO: 30 a 350 kg, 1 casa decimal, null remove, e nada mais passa', async () => {
      const ok = async (v: unknown) => (await validate(plainToInstance(SetWeightGoalDto, { goalWeightKg: v }))).length === 0;
      expect(await ok(72.5)).toBe(true);
      expect(await ok(null)).toBe(true);
      expect(await ok(30)).toBe(true);
      expect(await ok(350)).toBe(true);
      for (const bad of [29.9, 350.1, 72.55, '72', 'x', undefined, NaN]) expect(await ok(bad)).toBe(false);
    });

    it('menor de 18 anos: 403 com mensagem neutra; remover continua possível', async () => {
      const teen = await person({ birthDate: new Date(Date.now() - 16 * 365.25 * 86_400_000) }, 'Teen');
      await expect(weight.setGoal(teen.id, 70)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(weight.setGoal(teen.id, 70)).rejects.toMatchObject({ message: UNDER_18_MESSAGE });
      await expect(weight.setGoal(teen.id, null)).resolves.toEqual({ goal: null });
    });

    it('remover zera os três campos; posse: cada pessoa só mexe na própria meta', async () => {
      const [a, b] = [await person(), await person({}, 'Bia')];
      await weight.setGoal(a.id, 74);
      await weight.setGoal(b.id, 70);
      await weight.setGoal(a.id, null);
      const pa = await prisma.profile.findUniqueOrThrow({ where: { userId: a.id } });
      expect([pa.goalWeightKg, pa.goalStartWeightKg, pa.goalSetAt]).toEqual([null, null, null]);
      expect((await prisma.profile.findUniqueOrThrow({ where: { userId: b.id } })).goalWeightKg).toBe(70);
      expect(((await weight.summary(a.id)) as any).goal).toBeNull();
    });

    it('a meta de peso não mexe em metas de calorias nem no objetivo', async () => {
      const u = await person();
      const before = await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } });
      await weight.setGoal(u.id, 72);
      const after = await prisma.profile.findUniqueOrThrow({ where: { userId: u.id } });
      expect([after.kcalTarget, after.proteinTarget, after.carbsTarget, after.fatTarget, after.goal, after.customTargets]).toEqual([
        before.kcalTarget, before.proteinTarget, before.carbsTarget, before.fatTarget, before.goal, before.customTargets,
      ]);
    });
  });

  // ======================================================================== água
  describe('água: meta do dia', () => {
    it('automática: 35 ml/kg pela tendência de 7 dias, arredondada; sem tendência usa o peso do perfil', async () => {
      const u = await person({ weightKg: 70 });
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2450);
      expect((await water.get(u.id, TODAY)).explain).toEqual({ weightKg: 70, baseMl: 2450, workoutMl: 0 });
      const b = await person({ weightKg: 70 }, 'Bia');
      for (let i = 6; i >= 0; i--) await w(b.id, shift(-i), 90);
      expect((await water.get(b.id, TODAY)).goalMl).toBe(3150); // tendência 90 kg
    });

    it('treino do dia soma 10 ml/min (máx. 1000) e o piso/teto valem', async () => {
      const u = await person({ weightKg: 70 });
      await prisma.workout.create({ data: { userId: u.id, date: day(TODAY), type: 'RUN', durationMin: 45, intensity: 'MODERATE' } });
      const r = await water.get(u.id, TODAY);
      expect(r.goalMl).toBe(2900);
      expect(r.explain).toMatchObject({ workoutMl: 450 });
      const light = await person({ weightKg: 38 }, 'Leve');
      expect((await water.get(light.id, TODAY)).goalMl).toBe(1500);
      const heavy = await person({ weightKg: 140 }, 'Pesada');
      expect((await water.get(heavy.id, TODAY)).goalMl).toBe(4000);
    });

    it('MANUAL usa a meta digitada; menor de 18: só manual (sem cálculo, a pessoa precisa definir)', async () => {
      const u = await person({ weightKg: 70, waterGoalMode: 'MANUAL', waterGoalManualMl: 3000 });
      expect(await water.get(u.id, TODAY)).toMatchObject({ goalMl: 3000, goalSource: 'manual', needsManualGoal: false });
      const teen = await person({ birthDate: new Date(Date.now() - 15 * 365.25 * 86_400_000) }, 'Teen');
      expect(await water.get(teen.id, TODAY)).toMatchObject({ goalMl: null, goalSource: 'manual', needsManualGoal: true });
      await profiles.updatePreferences(teen.id, { waterGoalManualMl: 2000 } as any);
      expect(await water.get(teen.id, TODAY)).toMatchObject({ goalMl: 2000, needsManualGoal: false });
    });

    it('o WaterDay é gravado no primeiro acesso e dias passados nunca são recalculados', async () => {
      const u = await person({ weightKg: 70 });
      const past = shift(-10);
      await water.get(u.id, past);
      expect((await prisma.waterDay.findUniqueOrThrow({ where: { userId_date: { userId: u.id, date: day(past) } } })).goalMl).toBe(2450);
      // peso, treino e preferência mudam muito: o dia passado fica congelado
      await prisma.profile.update({ where: { userId: u.id }, data: { weightKg: 100 } });
      await weight.save(u.id, past, { weightKg: 100 } as any);
      await prisma.workout.create({ data: { userId: u.id, date: day(past), type: 'RUN', durationMin: 90, intensity: 'HARD' } });
      await workouts.create(u.id, { date: past, type: 'RUN', durationMin: 90, intensity: 'HARD' } as any);
      await profiles.updatePreferences(u.id, { waterGoalMode: 'MANUAL', waterGoalManualMl: 4500 } as any);
      expect((await water.get(u.id, past)).goalMl).toBe(2450);
      expect(await water.recalcAround(u.id, past)).toBe(false);
    });

    it('hoje: recalcula ao registrar peso, ao criar/alterar/apagar treino e ao mudar a preferência, só com diferença >= 100 ml', async () => {
      const u = await person({ weightKg: 70 });
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2450);

      // peso novo muda pouco (<100 ml): a meta de hoje não muda à toa
      await weight.save(u.id, TODAY, { weightKg: 71 } as any); // 2485 -> 2500: diferença de 50
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2450);
      // peso bem diferente: atualiza
      await weight.save(u.id, TODAY, { weightKg: 80 } as any); // 2800
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2800);

      // treino criado: + minutos
      const created: any = await workouts.create(u.id, { date: TODAY, type: 'RUN', durationMin: 30, intensity: 'MODERATE' } as any);
      expect((await water.get(u.id, TODAY)).goalMl).toBe(3100);
      // treino alterado
      await workouts.update(u.id, created.id, { durationMin: 60 } as any);
      expect((await water.get(u.id, TODAY)).goalMl).toBe(3400);
      // treino apagado
      await workouts.remove(u.id, created.id);
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2800);

      // preferência: manual
      await profiles.updatePreferences(u.id, { waterGoalMode: 'MANUAL', waterGoalManualMl: 2000 } as any);
      expect(await water.get(u.id, TODAY)).toMatchObject({ goalMl: 2000, goalSource: 'manual' });
      // manual muda 50 ml: abaixo do mínimo, mantém
      await profiles.updatePreferences(u.id, { waterGoalManualMl: 2050 } as any);
      expect((await water.get(u.id, TODAY)).goalMl).toBe(2000);
    });

    it('preferências: validação de manual (1000-5000), garrafa (100-2000) e null só para limpar', async () => {
      const ok = async (o: object) => (await validate(plainToInstance(PreferencesDto, o), { whitelist: true, forbidNonWhitelisted: true })).length === 0;
      expect(await ok({ waterGoalManualMl: 1000, waterBottleMl: 100 })).toBe(true);
      expect(await ok({ waterGoalManualMl: 5000, waterBottleMl: 2000 })).toBe(true);
      expect(await ok({ waterGoalManualMl: null, waterBottleMl: null })).toBe(true);
      for (const bad of [{ waterGoalManualMl: 999 }, { waterGoalManualMl: 5001 }, { waterBottleMl: 99 }, { waterBottleMl: 2001 }, { waterGoalManualMl: 2000.5 }, { waterEnabled: 'sim' }, { waterEnabled: null }, { waterGoalMode: 'OUTRO' }]) {
        expect(await ok(bad)).toBe(false);
      }
      expect(await ok({ waterEnabled: false, waterGoalMode: 'MANUAL' })).toBe(true);
    });
  });

  describe('água: registros, total e limites', () => {
    it('soma o total do dia; cada pessoa só vê e apaga os próprios registros', async () => {
      const [a, b] = [await person(), await person({}, 'Bia')];
      const e1 = (await water.add(a.id, TODAY, 200)).entry;
      await water.add(a.id, TODAY, 300);
      await water.add(b.id, TODAY, 500);
      const day1 = await water.get(a.id, TODAY);
      expect(day1.totalMl).toBe(500);
      expect(day1.entries.map((e) => e.amountMl)).toEqual([200, 300]);
      expect((await water.get(b.id, TODAY)).totalMl).toBe(500);
      await expect(water.remove(b.id, e1.id)).rejects.toBeInstanceOf(NotFoundException); // do outro
      await water.remove(a.id, e1.id);
      expect((await water.get(a.id, TODAY)).totalMl).toBe(300);
      await expect(water.remove(a.id, e1.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('quantidade por registro (50 a 2000 ml, inteiro) e data não futura', async () => {
      const u = await person();
      const ok = async (o: object) => (await validate(plainToInstance(AddWaterDto, o))).length === 0;
      expect(await ok({ date: TODAY, amountMl: 50 })).toBe(true);
      expect(await ok({ date: TODAY, amountMl: 2000 })).toBe(true);
      for (const bad of [49, 2001, 200.5, 'x', undefined]) expect(await ok({ date: TODAY, amountMl: bad })).toBe(false);
      await expect(water.add(u.id, shift(3), 200)).rejects.toBeInstanceOf(BadRequestException);
      await expect(water.get(u.id, shift(3))).rejects.toBeInstanceOf(BadRequestException);
    });

    it('o dia fica limitado a 8000 ml (422 neutro), inclusive com registros simultâneos', async () => {
      const u = await person();
      for (let i = 0; i < 4; i++) await water.add(u.id, TODAY, 2000); // 8000
      const err = await water.add(u.id, TODAY, 50).catch((e) => e);
      expect(err).toBeInstanceOf(UnprocessableEntityException);
      expect(err.message).toMatch(/8\.000 ml/);
      expect(err.message).not.toMatch(/falhou|culpa|exagerou/i);
      expect((await water.get(u.id, TODAY)).totalMl).toBe(8000);
      // simultâneos com 1 vaga de 2000
      const v = await person({}, 'Corrida');
      for (let i = 0; i < 3; i++) await water.add(v.id, TODAY, 2000); // 6000
      const results = await Promise.allSettled(Array.from({ length: 5 }, () => water.add(v.id, TODAY, 2000)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await water.get(v.id, TODAY)).totalMl).toBe(8000);
    });

    it('datas locais: um dia não vaza para o outro (YYYY-MM-DD)', async () => {
      const u = await person();
      await water.add(u.id, '2026-11-10', 400);
      await water.add(u.id, '2026-11-11', 600);
      expect((await water.get(u.id, '2026-11-10')).totalMl).toBe(400);
      expect((await water.get(u.id, '2026-11-11')).totalMl).toBe(600);
      const r = await water.range(u.id, '2026-11-01', '2026-11-30');
      expect(r.days.map((d) => [d.date, d.totalMl])).toEqual([['2026-11-10', 400], ['2026-11-11', 600]]);
      await expect(water.range(u.id, '2026-01-01', '2026-12-31')).rejects.toBeInstanceOf(BadRequestException); // > 93 dias
      await expect(water.range(u.id, '2026-11-11', '2026-11-01')).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('água: sequência', () => {
    const fill = async (userId: string, date: string, ml: number, goal: number) => {
      await prisma.waterDay.upsert({ where: { userId_date: { userId, date: day(date) } }, create: { userId, date: day(date), goalMl: goal }, update: { goalMl: goal } });
      if (ml > 0) await prisma.waterEntry.create({ data: { userId, date: day(date), amountMl: ml } });
    };

    it('hoje ainda sem bater: a sequência termina ontem; bateu hoje: termina hoje', async () => {
      const u = await person();
      await fill(u.id, shift(-2), 2500, 2500);
      await fill(u.id, shift(-1), 3000, 2500);
      await fill(u.id, TODAY, 500, 2500);
      expect(await water.streak(u.id, TODAY)).toEqual({ current: 2, best: 2 });
      await prisma.waterEntry.create({ data: { userId: u.id, date: day(TODAY), amountMl: 2000 } });
      expect(await water.streak(u.id, TODAY)).toEqual({ current: 3, best: 3 });
    });

    it('um dia abaixo da meta quebra; meta diferente por dia vale a do próprio dia; o melhor é guardado', async () => {
      const u = await person();
      for (let i = 9; i >= 6; i--) await fill(u.id, shift(-i), 2000, 2000); // 4 seguidos
      await fill(u.id, shift(-5), 1000, 2000); // quebra
      await fill(u.id, shift(-2), 1500, 1500); // meta menor naquele dia: bateu
      await fill(u.id, shift(-1), 2400, 2500); // quase: não bateu
      expect(await water.streak(u.id, TODAY)).toEqual({ current: 0, best: 4 });
      await fill(u.id, TODAY, 2600, 2500);
      expect(await water.streak(u.id, TODAY)).toEqual({ current: 1, best: 4 });
    });

    it('é só do próprio usuário', async () => {
      const [a, b] = [await person(), await person({}, 'Bia')];
      await fill(a.id, TODAY, 3000, 2500);
      expect((await water.streak(a.id, TODAY)).current).toBe(1);
      expect(await water.streak(b.id, TODAY)).toEqual({ current: 0, best: 0 });
    });
  });

  // ======================================================================== integrações
  describe('relatório semanal, exportação e conta', () => {
    const lastMonday = () => {
      const d = new Date(`${shift(-7)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
      return iso(d);
    };

    it('relatório: "meta batida em N de M dias" com o contador ligado; sem a linha se desligado ou sem registro', async () => {
      const u = await person();
      const reports = new ReportsService(prisma);
      const start = lastMonday();
      const addDays = (n: number) => iso(new Date(new Date(`${start}T00:00:00Z`).getTime() + n * 86_400_000));
      expect((await reports.weekly(u.id, start) as any).water).toBeNull(); // nenhum dia registrado
      for (let i = 0; i < 3; i++) {
        await prisma.waterDay.create({ data: { userId: u.id, date: day(addDays(i)), goalMl: 2000 } });
        await prisma.waterEntry.create({ data: { userId: u.id, date: day(addDays(i)), amountMl: i < 2 ? 2100 : 800 } });
      }
      expect((await reports.weekly(u.id, start) as any).water).toEqual({ loggedDays: 3, goalDays: 2 });
      await prisma.profile.update({ where: { userId: u.id }, data: { waterEnabled: false } });
      expect((await reports.weekly(u.id, start) as any).water).toBeNull();
    });

    it('relatório: "faltam X kg" só com meta e peso visível; some com hideWeightInReports; não altera o resto', async () => {
      const u = await person();
      const reports = new ReportsService(prisma);
      const start = lastMonday();
      await w(u.id, start, 80);
      await weight.setGoal(u.id, 74);
      const withGoal: any = await reports.weekly(u.id, start);
      expect(withGoal.weightGoal).toMatchObject({ targetKg: 74 });
      expect(withGoal.weightGoal.remainingKg).toBeCloseTo(6, 1);
      await prisma.profile.update({ where: { userId: u.id }, data: { hideWeightInReports: true } });
      const hidden: any = await reports.weekly(u.id, start);
      expect(hidden.weightGoal).toBeNull();
      expect(JSON.stringify(hidden)).not.toContain('"weightKg"');
    });

    it('exportação CSV de água (data; total; meta) só do usuário, e a de peso traz o rodapé "Meta de peso (kg)"', async () => {
      const [a, b] = [await person(), await person({}, 'Bia')];
      const exp = new ExportService(prisma);
      await water.add(a.id, '2026-11-10', 700);
      await water.add(a.id, '2026-11-10', 300);
      await water.add(b.id, '2026-11-10', 999);
      const text = async (g: AsyncGenerator<string>) => { let s = ''; for await (const c of g) s += c; return s; };
      const csv = await text(exp.waterCsv(a.id, '2026-11-01', '2026-11-30'));
      expect(csv).toContain('Data;Total (ml);Meta do dia (ml)'.replace(/;/g, csv.includes(';') ? ';' : ','));
      expect(csv).toMatch(/2026-11-10|10\/11\/2026/);
      expect(csv).toContain('1000');
      expect(csv).not.toContain('999');
      expect((await exp.summary(a.id, '2026-11-01', '2026-11-30')).water).toBe(2);

      await w(a.id, '2026-11-10', 80);
      await weight.setGoal(a.id, 74);
      expect(await text(exp.weightCsv(a.id, '2026-11-01', '2026-11-30'))).toContain('Meta de peso (kg)');
      expect(await text(exp.weightCsv(b.id, '2026-11-01', '2026-11-30'))).not.toContain('Meta de peso (kg)');
    });

    it('exclusão de conta: WaterEntry, WaterDay e a meta de peso saem junto', async () => {
      const u = await person();
      await weight.setGoal(u.id, 74);
      await water.add(u.id, TODAY, 500);
      expect(await prisma.waterEntry.count({ where: { userId: u.id } })).toBe(1);
      expect(await prisma.waterDay.count({ where: { userId: u.id } })).toBe(1);
      await prisma.user.delete({ where: { id: u.id } }); // Cascade: o perfil (e a meta de peso) vai junto
      expect(await prisma.waterEntry.count()).toBe(0);
      expect(await prisma.waterDay.count()).toBe(0);
      expect(await prisma.profile.count({ where: { userId: u.id } })).toBe(0);
    });
  });
});

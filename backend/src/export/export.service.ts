import { Injectable } from '@nestjs/common';
import { MealSource, MealType } from '@prisma/client';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { movingAverages, TREND_WINDOW_DAYS } from '../weight/weight.math';
import { estimateKcal } from '../workouts/workout.math';
import { BOM, dateCell, numCell, row, textCell } from './csv';
import { amountText, SITE_LABEL, unitText } from '../supplements/supplements.format';
import { dayBatches, shiftDay } from './period';

/** 2026-11-19T10:05:00.000Z → "19/11/2026 10:05" (UTC: o arquivo diz isso no cabeçalho). */
const utcStamp = (d: Date) => `${dateCell(d.toISOString().slice(0, 10))} ${d.toISOString().slice(11, 16)}`;

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'LUNCH', 'SNACK', 'DINNER'];

export const MEAL_LABEL: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã',
  LUNCH: 'Almoço',
  SNACK: 'Lanche',
  DINNER: 'Jantar',
};

export const SOURCE_LABEL: Record<MealSource, string> = {
  PHOTO: 'Foto',
  TEXT: 'Descrição',
  MANUAL: 'Manual',
  SEARCH: 'Busca',
};

export const MEALS_HEADER = [
  'Data',
  'Refeição',
  'Alimento',
  'Gramas',
  'Kcal',
  'Proteína (g)',
  'Carboidratos (g)',
  'Gorduras (g)',
  'Origem',
  'Estimativa',
];
export const DAY_TOTALS_HEADER = ['Data', 'Kcal', 'Proteína (g)', 'Carboidratos (g)', 'Gorduras (g)', 'Meta de kcal'];
export const WATER_HEADER = ['Data', 'Total (ml)', 'Meta do dia (ml)'];
const WORKOUT_HEADER = ['Data', 'Tipo', 'Duração (min)', 'Intensidade', 'Nota'];
export const WORKOUT_ESTIMATE_HEADER = 'Gasto estimado (kcal)';
export const WORKOUT_TYPE_LABEL: Record<string, string> = {
  STRENGTH: 'Musculação',
  RUN: 'Corrida',
  BIKE: 'Bike',
  WALK: 'Caminhada',
  OTHER: 'Outro',
};
export const WORKOUT_INTENSITY_LABEL: Record<string, string> = { LIGHT: 'Leve', MODERATE: 'Moderada', HARD: 'Forte' };
export const SUPPLEMENT_HEADER = ['Data', 'Item', 'Dose', 'Unidade', 'Status', 'Local'];
export const FASTING_HEADER = ['Início (UTC)', 'Fim (UTC)', 'Meta (h)', 'Duração (min)', 'Nota'];
export const WELLBEING_HEADER = ['Data', 'Náusea', 'Apetite', 'Energia', 'Intestino', 'Nota'];
/** Rótulos das escalas 0 a 3 (os mesmos do app). */
export const WELLBEING_LABELS = {
  nausea: ['Nada', 'Leve', 'Moderada', 'Forte'],
  appetite: ['Nenhum', 'Baixo', 'Normal', 'Alto'],
  energy: ['Baixa', 'Média', 'Boa', 'Alta'],
  gi: ['Tranquilo', 'Leve', 'Moderado', 'Forte'],
} as const;
export const WEIGHT_HEADER = ['Data', 'Peso (kg)', 'Média de 7 dias (kg)', 'Nota'];

interface DayTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/**
 * Exportação em CSV. Os geradores devolvem o arquivo em pedaços (o controller transmite em streaming) e buscam
 * as refeições em lotes de dias: um ano inteiro de itens nunca fica na memória de uma vez.
 * Toda consulta filtra pelo usuário da sessão.
 */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  /** Quantos registros o período tem (o app avisa antes de baixar um arquivo vazio). */
  async summary(userId: string, from: string, to: string) {
    const range = { gte: parseDay(from), lte: parseDay(to) };
    const [meals, items, weights, workouts, water] = await Promise.all([
      this.prisma.meal.count({ where: { userId, date: range } }),
      this.prisma.mealItem.count({ where: { meal: { userId, date: range } } }),
      this.prisma.weightEntry.count({ where: { userId, date: range } }),
      this.prisma.workout.count({ where: { userId, date: range } }),
      this.prisma.waterEntry.count({ where: { userId, date: range } }),
    ]);
    return { from, to, meals, items, weights, workouts, water };
  }

  async *mealsCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(MEALS_HEADER.map(textCell));

    const totals = new Map<string, DayTotals>();
    for (const [start, end] of dayBatches(from, to)) {
      const meals = await this.prisma.meal.findMany({
        where: { userId, date: { gte: parseDay(start), lte: parseDay(end) } },
        include: { items: { orderBy: { name: 'asc' } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      });
      // O enum no banco não está na ordem do dia: ordena por data, depois Café, Almoço, Lanche, Jantar
      meals.sort(
        (a, b) => a.date.getTime() - b.date.getTime() || MEAL_ORDER.indexOf(a.type) - MEAL_ORDER.indexOf(b.type),
      );

      let chunk = '';
      for (const meal of meals) {
        const day = formatDay(meal.date);
        const t = totals.get(day) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
        for (const item of meal.items) {
          t.kcal += item.kcal;
          t.protein += item.protein;
          t.carbs += item.carbs;
          t.fat += item.fat;
          chunk += row([
            dateCell(day),
            textCell(MEAL_LABEL[meal.type]),
            textCell(item.name),
            numCell(item.grams),
            numCell(item.kcal, 0),
            numCell(item.protein),
            numCell(item.carbs),
            numCell(item.fat),
            textCell(SOURCE_LABEL[meal.source]),
            item.estimated ? 'sim' : 'não',
          ]);
        }
        totals.set(day, t);
      }
      if (chunk) yield chunk;
    }

    if (totals.size === 0) return; // período sem dados: só o cabeçalho

    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { kcalTarget: true } });
    let block = row([]) + row(['Totais por dia']) + row(DAY_TOTALS_HEADER.map(textCell));
    for (const [day, t] of [...totals].sort(([a], [b]) => a.localeCompare(b))) {
      block += row([
        dateCell(day),
        numCell(t.kcal, 0),
        numCell(t.protein),
        numCell(t.carbs),
        numCell(t.fat),
        numCell(profile?.kcalTarget ?? null, 0),
      ]);
    }
    yield block;
  }

  async *weightCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(WEIGHT_HEADER.map(textCell));

    // A média de 7 dias do primeiro registro usa os 6 dias anteriores ao período
    const rows = await this.prisma.weightEntry.findMany({
      where: { userId, date: { gte: parseDay(shiftDay(from, -(TREND_WINDOW_DAYS - 1))), lte: parseDay(to) } },
      orderBy: { date: 'asc' },
      select: { date: true, weightKg: true, note: true },
    });
    const notes = new Map(rows.map((r) => [formatDay(r.date), r.note]));
    const inRange = movingAverages(rows.map((r) => ({ date: formatDay(r.date), weightKg: r.weightKg }))).filter(
      (p) => p.date >= from,
    );

    let body = '';
    for (const p of inRange) {
      body += row([dateCell(p.date), numCell(p.weightKg), numCell(p.trendKg, 2), textCell(notes.get(p.date))]);
    }
    if (inRange.length >= 2) {
      const change = inRange[inRange.length - 1].trendKg - inRange[0].trendKg;
      body += row([]) + row([textCell('Variação no período (kg)'), numCell(change, 2)]);
    }
    // Meta de peso (se existir): só o valor de referência, no rodapé
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { goalWeightKg: true } });
    if (profile?.goalWeightKg != null) body += row([]) + row([textCell('Meta de peso (kg)'), numCell(profile.goalWeightKg)]);
    if (body) yield body;
  }

  /** Água: um dia por linha (data; total em ml; meta do dia em ml), só dos dias com registro ou meta gravada. */
  async *waterCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(WATER_HEADER.map(textCell));
    const range = { gte: parseDay(from), lte: parseDay(to) };
    const [goals, entries] = await Promise.all([
      this.prisma.waterDay.findMany({ where: { userId, date: range } }),
      this.prisma.waterEntry.groupBy({ by: ['date'], where: { userId, date: range }, _sum: { amountMl: true } }),
    ]);
    const totals = new Map(entries.map((e) => [formatDay(e.date), e._sum.amountMl ?? 0]));
    const days = new Map(goals.map((g) => [formatDay(g.date), g.goalMl as number | null]));
    for (const d of totals.keys()) if (!days.has(d)) days.set(d, null);
    let body = '';
    for (const [day, goal] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
      if (!totals.has(day)) continue; // só dias com registro
      body += row([dateCell(day), numCell(totals.get(day) ?? 0, 0), numCell(goal, 0)]);
    }
    if (body) yield body;
  }

  /** Registros de suplementos e medicações no período (só para quem ativou o módulo; o controller confere). */
  async supplementsSummary(userId: string, from: string, to: string) {
    const supplements = await this.prisma.intakeLog.count({ where: { userId, date: { gte: parseDay(from), lte: parseDay(to) } } });
    return { from, to, supplements };
  }

  /**
   * Dado sensível: só sai se a pessoa pedir este arquivo (nunca junto dos demais por padrão). Usa o nome que a pessoa
   * cadastrou e a dose da época do registro, exatamente como digitada.
   */
  async *supplementsCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(SUPPLEMENT_HEADER.map(textCell));
    for (const [start, end] of dayBatches(from, to)) {
      const rows = await this.prisma.intakeLog.findMany({
        where: { userId, date: { gte: parseDay(start), lte: parseDay(end) } },
        include: { plan: { select: { name: true } } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      });
      let chunk = '';
      for (const l of rows) {
        chunk += row([
          dateCell(formatDay(l.date)),
          textCell(l.plan.name),
          amountText(l.doseAmount),
          textCell(unitText(l.doseUnit, l.doseUnitLabel)),
          l.status === 'TAKEN' ? 'Registrado' : 'Pulado',
          textCell(l.site ? SITE_LABEL[l.site] : ''),
        ]);
      }
      if (chunk) yield chunk;
    }
  }

  /** Treinos do período. A coluna de estimativa só existe se a pessoa ligou a estimativa (nunca por padrão). */
  async *workoutsCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    const profile = await this.prisma.profile.findUnique({
      where: { userId },
      select: { weightKg: true, workoutEstimateEnabled: true },
    });
    const withEstimate = !!profile?.workoutEstimateEnabled;
    yield BOM + row([...WORKOUT_HEADER, ...(withEstimate ? [WORKOUT_ESTIMATE_HEADER] : [])].map(textCell));

    for (const [start, end] of dayBatches(from, to)) {
      const rows = await this.prisma.workout.findMany({
        where: { userId, date: { gte: parseDay(start), lte: parseDay(end) } },
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
      });
      let chunk = '';
      for (const w of rows) {
        chunk += row([
          dateCell(formatDay(w.date)),
          textCell(WORKOUT_TYPE_LABEL[w.type]),
          numCell(w.durationMin, 0),
          textCell(WORKOUT_INTENSITY_LABEL[w.intensity]),
          textCell(w.note),
          ...(withEstimate ? [numCell(estimateKcal(w, profile!.weightKg), 0)] : []),
        ]);
      }
      if (chunk) yield chunk;
    }
  }

  /** Janelas de jejum no período (dado sensível: só para quem ativou; o controller confere). */
  async fastingSummary(userId: string, from: string, to: string) {
    const fasting = await this.prisma.fastingSession.count({
      where: { userId, startedAt: { gte: parseDay(from), lt: parseDay(shiftDay(to, 1)) } },
    });
    return { from, to, fasting };
  }

  /** Dado sensível: só sai se a pessoa pedir este arquivo. Horários em UTC. */
  async *fastingCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(FASTING_HEADER.map(textCell));
    for (const [start, end] of dayBatches(from, to)) {
      const rows = await this.prisma.fastingSession.findMany({
        where: { userId, startedAt: { gte: parseDay(start), lt: parseDay(shiftDay(end, 1)) } },
        orderBy: { startedAt: 'asc' },
      });
      let chunk = '';
      for (const f of rows) {
        chunk += row([
          utcStamp(f.startedAt),
          f.endedAt ? utcStamp(f.endedAt) : '',
          numCell(f.targetHours, 0),
          f.endedAt ? numCell(Math.round((f.endedAt.getTime() - f.startedAt.getTime()) / 60_000), 0) : '',
          textCell(f.note),
        ]);
      }
      if (chunk) yield chunk;
    }
  }

  /** Respostas de bem-estar no período (dado sensível: só para quem ativou GLP-1 ou suplementos). */
  async wellbeingSummary(userId: string, from: string, to: string) {
    const wellbeing = await this.prisma.wellbeingLog.count({ where: { userId, date: { gte: parseDay(from), lte: parseDay(to) } } });
    return { from, to, wellbeing };
  }

  async *wellbeingCsv(userId: string, from: string, to: string): AsyncGenerator<string> {
    yield BOM + row(WELLBEING_HEADER.map(textCell));
    const label = (k: keyof typeof WELLBEING_LABELS, v: number | null) => (v === null ? '' : (WELLBEING_LABELS[k][v] ?? ''));
    for (const [start, end] of dayBatches(from, to)) {
      const rows = await this.prisma.wellbeingLog.findMany({
        where: { userId, date: { gte: parseDay(start), lte: parseDay(end) } },
        orderBy: { date: 'asc' },
      });
      let chunk = '';
      for (const w of rows) {
        chunk += row([
          dateCell(formatDay(w.date)),
          textCell(label('nausea', w.nausea)),
          textCell(label('appetite', w.appetite)),
          textCell(label('energy', w.energy)),
          textCell(label('gi', w.gi)),
          textCell(w.note),
        ]);
      }
      if (chunk) yield chunk;
    }
  }
}

import { BadRequestException } from '@nestjs/common';
import type { Administration, DoseUnit, ScheduleType, Slot, SupplementCategory } from '@prisma/client';
import { normalizeSlots } from './supplements.schedule';

/** Plano com tudo preenchido (datas "YYYY-MM-DD"): o que o serviço grava depois de mesclar a edição com o que já existe. */
export interface PlanInput {
  name: string;
  category: SupplementCategory;
  administration?: Administration;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel?: string | null;
  scheduleType: ScheduleType;
  weekdays?: number[];
  intervalDays?: number | null;
  slots?: Slot[];
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  trackSite?: boolean;
  showOnWeightChart?: boolean;
}

export interface CleanPlan {
  name: string;
  category: SupplementCategory;
  administration: Administration;
  doseAmount: number;
  doseUnit: DoseUnit;
  doseUnitLabel: string | null;
  scheduleType: ScheduleType;
  weekdays: number[];
  intervalDays: number | null;
  slots: Slot[];
  startDate: string;
  endDate: string | null;
  notes: string | null;
  trackSite: boolean;
  showOnWeightChart: boolean;
}

/**
 * Regras que dependem de mais de um campo. As mensagens nunca repetem o que a pessoa digitou. A dose só precisa ser
 * positiva (o DTO já garante): nenhuma faixa é validada e nada é convertido.
 */
export function cleanPlan(p: PlanInput): CleanPlan {
  const administration = p.administration ?? 'ORAL';
  const label = p.doseUnitLabel?.trim() || null;
  if (p.doseUnit === 'OTHER' && !label) throw new BadRequestException('Informe a unidade');

  let weekdays: number[] = [];
  if (p.scheduleType === 'WEEKDAYS') {
    weekdays = [...new Set(p.weekdays ?? [])].sort((a, b) => a - b);
    if (weekdays.length === 0) throw new BadRequestException('Escolha ao menos um dia da semana');
  }
  let intervalDays: number | null = null;
  if (p.scheduleType === 'EVERY_N_DAYS') {
    intervalDays = p.intervalDays ?? null;
    if (intervalDays === null || !Number.isInteger(intervalDays) || intervalDays < 2 || intervalDays > 90) {
      throw new BadRequestException('Informe o intervalo em dias (de 2 a 90)');
    }
  }
  const endDate = p.endDate ?? null;
  if (endDate !== null && endDate < p.startDate) throw new BadRequestException('A data de fim precisa ser depois do início');

  return {
    name: p.name.trim(),
    category: p.category,
    administration,
    doseAmount: p.doseAmount,
    doseUnit: p.doseUnit,
    doseUnitLabel: p.doseUnit === 'OTHER' ? label : null,
    scheduleType: p.scheduleType,
    weekdays,
    intervalDays,
    slots: normalizeSlots(p.slots),
    startDate: p.startDate,
    endDate,
    notes: p.notes?.trim() || null,
    // O local da aplicação só faz sentido para injetáveis
    trackSite: administration === 'INJECTION' && !!p.trackSite,
    showOnWeightChart: !!p.showOnWeightChart,
  };
}

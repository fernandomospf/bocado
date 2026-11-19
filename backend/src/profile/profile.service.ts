import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Profile } from '@prisma/client';
import { WaterService } from '../water/water.service';
import { formatDay, parseDay } from '../common/dates';
import { PrismaService } from '../prisma/prisma.service';
import { BodyDataDto, PreferencesDto, SaveProfileDto, TargetsDto } from './dto/profile.dto';
import { effectiveProteinFloor, suggestProteinFloor } from './glp1';
import { ageFrom, BodyData, suggestTargets, Targets } from './nutrition';
import { summarizeTrend } from '../weight/weight.math';

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly water?: WaterService,
  ) {}

  private toBodyData(dto: BodyDataDto): BodyData {
    const birthDate = parseDay(dto.birthDate);
    const age = ageFrom(birthDate);
    if (Number.isNaN(birthDate.getTime()) || age < 13 || age > 110) {
      throw new BadRequestException('Data de nascimento inválida');
    }
    return { ...dto, birthDate };
  }

  preview(dto: BodyDataDto) {
    return suggestTargets(this.toBodyData(dto));
  }

  async get(userId: string) {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');
    return this.serialize(profile);
  }

  async save(userId: string, dto: SaveProfileDto) {
    const { targets: manual, ...body } = dto;
    const data = this.toBodyData(body);
    const suggestion = suggestTargets(data);
    const existing = await this.prisma.profile.findUnique({ where: { userId } });

    let targets: Targets = suggestion;
    let customTargets = false;
    if (manual) {
      targets = manual;
      customTargets = !sameTargets(manual, suggestion);
    } else if (existing?.customTargets) {
      // Ao atualizar dados corporais, mantém metas que o usuário personalizou
      targets = fromProfile(existing);
      customTargets = true;
    }

    const fields = {
      ...data,
      kcalTarget: targets.kcal,
      proteinTarget: targets.protein,
      carbsTarget: targets.carbs,
      fatTarget: targets.fat,
      customTargets,
      targetsWeightKg: data.weightKg,
    };
    const profile = await this.prisma.profile.upsert({
      where: { userId },
      // Menores de 18 anos não recebem a meta padrão de movimento: só os minutos, até a pessoa definir a sua
      create: { userId, ...fields, ...(ageFrom(data.birthDate) < 18 ? { movementDailyGoalMin: null } : {}) },
      update: fields,
    });
    return this.serialize(profile);
  }

  async updateTargets(userId: string, dto: TargetsDto) {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Perfil ainda não criado');
    const suggestion = suggestTargets(existing);
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        kcalTarget: dto.kcal,
        proteinTarget: dto.protein,
        carbsTarget: dto.carbs,
        fatTarget: dto.fat,
        customTargets: !sameTargets(dto, suggestion),
        targetsWeightKg: existing.weightKg,
      },
    });
    return this.serialize(profile);
  }

  async resetTargets(userId: string) {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Perfil ainda não criado');
    const s = suggestTargets(existing);
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        kcalTarget: s.kcal,
        proteinTarget: s.protein,
        carbsTarget: s.carbs,
        fatTarget: s.fat,
        customTargets: false,
        targetsWeightKg: existing.weightKg,
      },
    });
    return this.serialize(profile);
  }

  async updatePreferences(userId: string, dto: PreferencesDto) {
    const existing = await this.prisma.profile.findUnique({ where: { userId } });
    if (!existing) throw new NotFoundException('Perfil ainda não criado');
    // Suplementos e medicações: indisponível para menores de 18 anos (403 neutro)
    if (dto.supplementsEnabled === true && ageFrom(existing.birthDate) < 18) {
      throw new ForbiddenException('Este recurso não está disponível para menores de 18 anos.');
    }
    // Modo GLP-1: indisponível para menores de 18 anos (403 neutro)
    if ((dto.glp1Mode === true || (dto.proteinFloorG !== undefined && dto.proteinFloorG !== null)) && ageFrom(existing.birthDate) < 18) {
      throw new ForbiddenException('Este recurso não está disponível para menores de 18 anos.');
    }
    // Jejum: indisponível para menores de 18 anos (403 neutro)
    if (dto.fastingEnabled === true && ageFrom(existing.birthDate) < 18) {
      throw new ForbiddenException('Este recurso não está disponível para menores de 18 anos.');
    }
    // A soma à meta só existe com a estimativa ligada: desligar a estimativa desliga a soma junto
    const estimate = dto.workoutEstimateEnabled ?? existing.workoutEstimateEnabled;
    const addToGoal = estimate ? (dto.workoutAddToGoal ?? existing.workoutAddToGoal) : false;
    if (dto.workoutAddToGoal === true && !estimate) {
      throw new BadRequestException('Ligue a estimativa de gasto dos treinos antes de somar à meta');
    }
    const profile = await this.prisma.profile.update({
      where: { userId },
      data: {
        ...(dto.workoutEstimateEnabled !== undefined || dto.workoutAddToGoal !== undefined
          ? { workoutEstimateEnabled: estimate, workoutAddToGoal: addToGoal }
          : {}),
        ...(dto.weekStartsOn !== undefined ? { weekStartsOn: dto.weekStartsOn } : {}),
        ...(dto.hideWeightInReports !== undefined ? { hideWeightInReports: dto.hideWeightInReports } : {}),
        ...(dto.hideCalories !== undefined ? { hideCalories: dto.hideCalories } : {}),
        ...(dto.adaptiveEnabled !== undefined ? { adaptiveEnabled: dto.adaptiveEnabled } : {}),
        ...(dto.waterEnabled !== undefined ? { waterEnabled: dto.waterEnabled } : {}),
        ...(dto.waterGoalMode !== undefined ? { waterGoalMode: dto.waterGoalMode } : {}),
        ...(dto.waterGoalManualMl !== undefined ? { waterGoalManualMl: dto.waterGoalManualMl } : {}),
        ...(dto.waterBottleMl !== undefined ? { waterBottleMl: dto.waterBottleMl } : {}),
        ...(dto.movementEnabled !== undefined ? { movementEnabled: dto.movementEnabled } : {}),
        ...(dto.supplementsEnabled !== undefined ? { supplementsEnabled: dto.supplementsEnabled } : {}),
        ...(dto.supplementsMaskNamesOnHome !== undefined ? { supplementsMaskNamesOnHome: dto.supplementsMaskNamesOnHome } : {}),
        ...(dto.fastingEnabled !== undefined ? { fastingEnabled: dto.fastingEnabled } : {}),
        ...(dto.glp1Mode !== undefined ? { glp1Mode: dto.glp1Mode } : {}),
        ...(dto.proteinFloorG !== undefined ? { proteinFloorG: dto.proteinFloorG } : {}),
        ...(dto.movementDailyGoalMin !== undefined ? { movementDailyGoalMin: dto.movementDailyGoalMin } : {}),
        ...(dto.movementRestDays !== undefined ? { movementRestDays: [...dto.movementRestDays].sort((a, b) => a - b) } : {}),
      },
    });
    if (dto.waterGoalMode !== undefined || dto.waterGoalManualMl !== undefined) await this.water?.recalcToday(userId);
    return this.serialize(profile);
  }

  async targetsFor(userId: string): Promise<Targets | null> {
    const profile = await this.prisma.profile.findUnique({ where: { userId } });
    return profile ? fromProfile(profile) : null;
  }

  /**
   * Piso de proteína do modo GLP-1: o editado ou a sugestão (maior entre a meta de proteína e 1,2 g/kg da tendência de
   * peso, até 200 g). Referência geral, não prescrição. Só é calculado com o modo ligado (dado sensível).
   */
  private async glp1Fields(p: Profile) {
    if (!p.glp1Mode) return { glp1Mode: false, proteinFloorG: null, proteinFloorSuggestion: null };
    const recent = await this.prisma.weightEntry.findMany({
      where: { userId: p.userId },
      orderBy: { date: 'desc' },
      take: 30,
      select: { date: true, weightKg: true },
    });
    const trend = summarizeTrend(recent.reverse().map((w) => ({ date: formatDay(w.date), weightKg: w.weightKg }))).trendKg;
    const suggestion = suggestProteinFloor(p.proteinTarget, trend ?? p.weightKg);
    return { glp1Mode: true, proteinFloorG: effectiveProteinFloor(p.proteinFloorG, suggestion), proteinFloorSuggestion: suggestion };
  }

  private async serialize(p: Profile) {
    return { ...this.serializeBase(p), ...(await this.glp1Fields(p)) };
  }

  private serializeBase(p: Profile) {
    return {
      sex: p.sex,
      birthDate: formatDay(p.birthDate),
      age: ageFrom(p.birthDate),
      heightCm: p.heightCm,
      weightKg: p.weightKg,
      activityLevel: p.activityLevel,
      goal: p.goal,
      targets: fromProfile(p),
      customTargets: p.customTargets,
      suggestion: suggestTargets(p),
      weekStartsOn: p.weekStartsOn,
      hideWeightInReports: p.hideWeightInReports,
      hideCalories: p.hideCalories,
      waterEnabled: p.waterEnabled,
      waterGoalMode: p.waterGoalMode,
      waterGoalManualMl: p.waterGoalManualMl,
      waterBottleMl: p.waterBottleMl,
      goalWeightKg: p.goalWeightKg,
      movementEnabled: p.movementEnabled,
      movementDailyGoalMin: p.movementDailyGoalMin,
      movementRestDays: p.movementRestDays,
      supplementsEnabled: p.supplementsEnabled,
      supplementsMaskNamesOnHome: p.supplementsMaskNamesOnHome,
      fastingEnabled: p.fastingEnabled,
      adaptiveEnabled: p.adaptiveEnabled,
      workoutEstimateEnabled: p.workoutEstimateEnabled,
      workoutAddToGoal: p.workoutAddToGoal,
      updatedAt: p.updatedAt,
    };
  }
}

function fromProfile(p: Profile): Targets {
  return { kcal: p.kcalTarget, protein: p.proteinTarget, carbs: p.carbsTarget, fat: p.fatTarget };
}

function sameTargets(a: Targets, b: Targets) {
  return a.kcal === b.kcal && a.protein === b.protein && a.carbs === b.carbs && a.fat === b.fat;
}

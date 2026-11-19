import { Injectable, NotFoundException } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { latestAllowedDay } from '../meals/meals.service';
import { PrismaService } from '../prisma/prisma.service';
import { isLowIntake } from '../profile/glp1';
import { recentLoggedKcal } from './glp1.data';

@Injectable()
export class Glp1Service {
  constructor(private readonly prisma: PrismaService) {}

  /** O aviso de segurança da Home (média dos últimos 5 dias registrados abaixo do piso de calorias). Só informa. */
  async summary(userId: string, today: string) {
    if (today > latestAllowedDay()) throw new BadRequestException('Data inválida');
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { sex: true } });
    if (!profile) throw new NotFoundException('Perfil ainda não criado');
    return { lowIntake: isLowIntake(await recentLoggedKcal(this.prisma, userId, today), profile.sex) };
  }
}

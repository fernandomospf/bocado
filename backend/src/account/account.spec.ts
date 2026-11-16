import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { DeleteAccountDto } from './account.dto';
import { AccountService } from './account.service';

function setup(user: { id: string; passwordHash: string | null } | null) {
  const calls: string[] = [];
  const tx = {
    householdMember: { findUnique: jest.fn().mockResolvedValue(null) },
    food: { updateMany: jest.fn().mockImplementation(() => calls.push('food.updateMany')) },
    user: { delete: jest.fn().mockImplementation(() => calls.push('user.delete')) },
  };
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    $transaction: jest.fn().mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new AccountService(prisma as never);
  jest.spyOn((service as unknown as { logger: { log: () => void } }).logger, 'log').mockImplementation(() => {});
  return { prisma, tx, calls, service };
}

const errorsOf = async (body: object) => (await validate(plainToInstance(DeleteAccountDto, body))).map((e) => e.property);

describe('DeleteAccountDto', () => {
  it('confirmation precisa ser exatamente "EXCLUIR"', async () => {
    expect(await errorsOf({ confirmation: 'EXCLUIR' })).toEqual([]);
    for (const wrong of ['excluir', 'EXCLUIR ', 'Excluir', '', undefined]) {
      expect(await errorsOf({ confirmation: wrong })).toEqual(['confirmation']);
    }
  });
});

describe('AccountService.deleteAccount', () => {
  const hash = bcrypt.hashSync('senha-certa', 4);

  it('conta com senha: sem senha → 400; senha errada → 403; nada é apagado', async () => {
    const a = setup({ id: 'u1', passwordHash: hash });
    await expect(a.service.deleteAccount('u1', { confirmation: 'EXCLUIR' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(a.service.deleteAccount('u1', { confirmation: 'EXCLUIR', password: 'errada' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(a.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('senha certa: solta os produtos do acervo e apaga o usuário, numa transação', async () => {
    const { service, tx, calls, prisma } = setup({ id: 'u1', passwordHash: hash });
    await service.deleteAccount('u1', { confirmation: 'EXCLUIR', password: 'senha-certa' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.food.updateMany).toHaveBeenCalledWith({ where: { contributedById: 'u1' }, data: { contributedById: null } });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'u1' } });
    expect(calls).toEqual(['food.updateMany', 'user.delete']);
  });

  it('conta só com Google (sem senha) dispensa a senha', async () => {
    const { service, tx } = setup({ id: 'g1', passwordHash: null });
    await service.deleteAccount('g1', { confirmation: 'EXCLUIR' });
    expect(tx.user.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
  });

  it('usuário que já não existe → 401', async () => {
    const { service } = setup(null);
    await expect(service.deleteAccount('x', { confirmation: 'EXCLUIR' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('auditoria só com id e data, sem e-mail', async () => {
    const { service } = setup({ id: 'u1', passwordHash: null });
    const log = jest.spyOn((service as unknown as { logger: { log: (m: string) => void } }).logger, 'log');
    await service.deleteAccount('u1', { confirmation: 'EXCLUIR' });
    expect(log.mock.calls[0][0]).toMatch(/^Conta excluída: u1 em \d{4}-\d{2}-\d{2}T/);
    expect(log.mock.calls[0][0]).not.toContain('@');
  });
});

describe('cascata no schema', () => {
  // Protege o futuro: um modelo novo ligado ao User sem onDelete deixaria dados para trás (ou travaria a exclusão)
  const relations = Prisma.dmmf.datamodel.models.flatMap((m) =>
    m.fields.filter((f) => f.type === 'User' && f.relationFromFields?.length).map((f) => ({ model: m.name, field: f.name, onDelete: f.relationOnDelete })),
  );

  it('toda relação com User apaga em cascata, exceto a autoria do acervo e a de refeição dividida (SetNull)', () => {
    expect(relations.length).toBeGreaterThanOrEqual(8);
    for (const r of relations) {
      // Refeição dividida: a cópia no diário de outra pessoa fica, sem o nome de quem a dividiu
      const keeps = (r.model === 'Food' && r.field === 'contributedBy') || (r.model === 'Meal' && r.field === 'sharedBy');
      const expected = keeps ? 'SetNull' : 'Cascade';
      expect({ ...r, onDelete: r.onDelete }).toEqual({ ...r, onDelete: expected });
    }
  });

  it('cobre perfil, refeições, peso, receitas, alimentos próprios, uso de IA e denúncias', () => {
    const models = new Set(relations.map((r) => r.model));
    for (const m of ['Profile', 'Meal', 'WeightEntry', 'Workout', 'Recipe', 'Food', 'AiUsage', 'FoodReport']) expect(models.has(m)).toBe(true);
    // Itens e ingredientes caem em cascata a partir da refeição e da receita
    const child = (model: string, type: string) =>
      Prisma.dmmf.datamodel.models.find((m) => m.name === model)?.fields.find((f) => f.type === type)?.relationOnDelete;
    expect(child('MealItem', 'Meal')).toBe('Cascade');
    expect(child('RecipeIngredient', 'Recipe')).toBe('Cascade');
  });
});

describe('JwtStrategy.validate', () => {
  const strategy = (found: object | null) =>
    new JwtStrategy(new ConfigService({ JWT_SECRET: 'x'.repeat(32) }), {
      user: { findUnique: jest.fn().mockResolvedValue(found) },
    } as never);

  it('token de usuário apagado → 401', async () => {
    await expect(strategy(null).validate({ sub: 'apagado', email: 'a@b.c' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('usuário existente segue autenticado', async () => {
    await expect(strategy({ id: 'u1' }).validate({ sub: 'u1', email: 'a@b.c' })).resolves.toEqual({ id: 'u1', email: 'a@b.c' });
  });
});

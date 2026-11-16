import { randomInt } from 'node:crypto';
import type { Prisma } from '@prisma/client';

/** Sem caracteres ambíguos: nada de 0, O, 1, I ou L. */
export const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_RE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/i;
export const INVITE_TTL_MS = 7 * 86_400_000;
export const MAX_ACTIVE_INVITES = 5;
export const MAX_MEMBERS = 6;

export function generateInviteCode(): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)];
  return code;
}

/**
 * Tira o usuário da casa (sair, ser removido ou excluir a conta). Roda dentro da transação do chamador.
 * - Receitas compartilhadas dele voltam a privadas.
 * - Convites que ele criou deixam de valer.
 * - Se era o OWNER e restam membros, o mais antigo assume; se não resta ninguém, a casa é apagada.
 * Devolve false se o usuário não estava em casa nenhuma.
 */
export async function removeFromHousehold(tx: Prisma.TransactionClient, userId: string): Promise<boolean> {
  const member = await tx.householdMember.findUnique({ where: { userId } });
  if (!member) return false;

  await tx.recipe.updateMany({ where: { ownerId: userId, householdId: member.householdId }, data: { householdId: null } });
  await tx.householdInvite.deleteMany({ where: { householdId: member.householdId, createdById: userId } });
  // Ofertas de refeição dividida pendentes, enviadas ou recebidas por ele, são apagadas
  await removePendingOffers(tx, userId);
  await tx.householdMember.delete({ where: { userId } });

  const rest = await tx.householdMember.findMany({
    where: { householdId: member.householdId },
    orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (rest.length === 0) {
    await tx.household.delete({ where: { id: member.householdId } });
  } else if (member.role === 'OWNER') {
    await tx.householdMember.update({ where: { id: rest[0].id }, data: { role: 'OWNER' } });
  }
  return true;
}

async function removePendingOffers(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.sharedMealOffer.deleteMany({ where: { OR: [{ fromUserId: userId }, { toUserId: userId }] } });
}

/**
 * Retorno sem culpa (puro, sem React): o card "Que bom te ver por aqui" aparece quando a pessoa volta depois de 3 dias ou
 * mais sem registrar. Sem notificação, e-mail ou mensagem de cobrança: só um convite quando ela abre o app.
 */

export const RETURN_MIN_DAYS = 3;
export const RETURN_DISMISS_KEY = 'bocado:return:dismissedFor';

export interface LastLog {
  lastLogDate: string | null;
  daysSinceLastLog: number | null;
}

/**
 * `dismissedFor` = o último registro (data) do retorno que a pessoa dispensou: dispensar vale para ESTE retorno. Quando
 * ela registrar algo e, no futuro, voltar de novo, o último registro é outro e o card volta a poder aparecer.
 */
export function returnCardVisible(args: { last: LastLog | undefined; loggedToday: boolean; dismissedFor: string | null }): boolean {
  const { last, loggedToday, dismissedFor } = args;
  if (!last || last.daysSinceLastLog === null || last.lastLogDate === null) return false; // conta nova ou carregando
  if (loggedToday) return false;
  if (last.daysSinceLastLog < RETURN_MIN_DAYS) return false;
  return dismissedFor !== last.lastLogDate;
}

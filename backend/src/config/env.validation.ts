import { Logger } from '@nestjs/common';
import { isValidTimeZone, parsePrices } from '../ai-usage/quota.math';

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'APP_URL'] as const;

export function validateEnv(config: Record<string, unknown>) {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Variáveis de ambiente ausentes: ${missing.join(', ')}`);
  }
  if (String(config.JWT_SECRET).length < 32) {
    throw new Error('JWT_SECRET precisa ter pelo menos 32 caracteres');
  }
  try {
    new URL(String(config.APP_URL));
  } catch {
    throw new Error('APP_URL precisa ser uma URL completa, ex.: https://bocado.seudominio.com');
  }

  // Acesso por convite do beta (tudo opcional; o padrão é cadastro aberto)
  const mode = config.REGISTRATION_MODE;
  if (mode !== undefined && mode !== '' && mode !== 'open' && mode !== 'invite') {
    throw new Error('REGISTRATION_MODE precisa ser "open" ou "invite"');
  }
  const max = config.BETA_MAX_USERS;
  if (max !== undefined && max !== '' && !/^[1-9]\d*$/.test(String(max))) {
    throw new Error('BETA_MAX_USERS precisa ser um inteiro positivo');
  }

  // Limites e custo da IA (todos opcionais, com padrões seguros)
  for (const key of ['AI_DAILY_LIMIT_PHOTO', 'AI_DAILY_LIMIT_TEXT', 'AI_DAILY_LIMIT_LABEL', 'AI_DAILY_LIMIT_SUGGEST', 'AI_MONTHLY_LIMIT_TOTAL']) {
    const v = config[key];
    if (v !== undefined && v !== '' && !/^\d+$/.test(String(v))) throw new Error(`${key} precisa ser um inteiro >= 0`);
  }
  const tz = config.AI_QUOTA_TZ;
  if (tz !== undefined && tz !== '' && !isValidTimeZone(String(tz))) throw new Error('AI_QUOTA_TZ precisa ser um fuso válido, ex.: America/Sao_Paulo');
  const budget = config.AI_MONTHLY_BUDGET_USD;
  if (budget !== undefined && budget !== '' && !(Number(String(budget).replace(',', '.')) > 0)) {
    throw new Error('AI_MONTHLY_BUDGET_USD precisa ser um número maior que 0');
  }
  const priced = parsePrices(config.AI_PRICES_JSON as string | undefined);
  if (priced.error) throw new Error(priced.error);

  const logger = new Logger('Config');
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY não definida: análise por foto e por descrição ficará desativada');
  }
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    logger.warn('GOOGLE_CLIENT_ID/SECRET não definidos: login com Google ficará desativado');
  }
  if (budget !== undefined && budget !== '' && Object.keys(priced.prices).length === 0) {
    logger.warn('AI_MONTHLY_BUDGET_USD definido sem AI_PRICES_JSON: o orçamento em dólares fica INATIVO e o custo aparece como "não configurado"');
  }
  if (mode === 'invite' && !String(config.ADMIN_EMAILS ?? '').trim()) {
    logger.warn('REGISTRATION_MODE=invite sem ADMIN_EMAILS: ninguém conseguirá gerar convites pelo painel');
  }
  return config;
}

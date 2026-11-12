import { Logger } from '@nestjs/common';

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

  const logger = new Logger('Config');
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY não definida: análise por foto e por descrição ficará desativada');
  }
  if (!config.GOOGLE_CLIENT_ID || !config.GOOGLE_CLIENT_SECRET) {
    logger.warn('GOOGLE_CLIENT_ID/SECRET não definidos: login com Google ficará desativado');
  }
  return config;
}

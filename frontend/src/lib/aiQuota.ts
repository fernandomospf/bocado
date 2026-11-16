import type { ApiError } from './api';

export type AiFeature = 'PHOTO' | 'TEXT' | 'LABEL' | 'SUGGEST';

export interface AiQuota {
  features: Record<AiFeature, { used: number; limit: number; resetsAt: string }>;
  monthly: { used: number; limit: number; resetsAt: string };
  paused: boolean;
}

/** Corpo do 429 de cota devolvido pelo servidor (code e message já em português). */
export interface AiQuotaError {
  code: 'AI_QUOTA_DAILY' | 'AI_QUOTA_MONTHLY' | 'AI_BUDGET_PAUSED' | 'AI_BLOCKED';
  message: string;
  feature: AiFeature;
  limit: number | null;
  used: number | null;
  resetsAt: string | null;
}

export const AI_FEATURE_NAME: Record<AiFeature, { many: string; one: string; alt: string }> = {
  PHOTO: { many: 'análises por foto', one: 'análise por foto', alt: 'dá para buscar o alimento, ler o código de barras ou digitar' },
  TEXT: { many: 'análises por descrição', one: 'análise por descrição', alt: 'dá para buscar o alimento, ler o código de barras ou digitar' },
  LABEL: { many: 'leituras de rótulo', one: 'leitura de rótulo', alt: 'dá para buscar o produto ou digitar os valores' },
  SUGGEST: { many: 'sugestões com IA', one: 'sugestão com IA', alt: 'dá para registrar por busca, repetir ontem ou usar as suas receitas' },
};

export const PAUSED_MESSAGE =
  'A análise por IA está em pausa por enquanto no beta. Você continua podendo registrar por busca, código de barras ou manual.';

/** Erro de cota de IA (429 com code AI_*), ou null para qualquer outro erro. */
export function aiQuotaError(err: unknown): AiQuotaError | null {
  // Sem instanceof (este módulo roda também nos testes do Node, sem o resto do app): o ApiError tem name, status e data
  const e = err as Partial<ApiError> | null;
  if (!e || e.name !== 'ApiError' || e.status !== 429) return null;
  const d = e.data as Partial<AiQuotaError> | null;
  return d && typeof d.code === 'string' && d.code.startsWith('AI_') && typeof d.message === 'string' ? (d as AiQuotaError) : null;
}

/** Quantas chamadas da funcionalidade ainda cabem hoje (considera o limite mensal e a pausa do beta). */
export function aiLeft(q: AiQuota | undefined, feature: AiFeature): number | null {
  if (!q) return null;
  if (q.paused) return 0;
  const f = q.features[feature];
  return Math.max(0, Math.min(f.limit - f.used, q.monthly.limit - q.monthly.used));
}

export type AiBlockReason = 'daily' | 'monthly' | 'paused' | 'blocked';

export function aiBlockReason(q: AiQuota | undefined, feature: AiFeature): AiBlockReason | null {
  if (!q) return null;
  if (q.paused) return 'paused';
  const f = q.features[feature];
  if (f.limit === 0) return 'blocked';
  if (q.monthly.limit - q.monthly.used <= 0) return 'monthly';
  if (f.limit - f.used <= 0) return 'daily';
  return null;
}

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

/** Mesma redação do servidor, para quando a cota já acabou e o botão da IA fica desabilitado. */
export function aiBlockMessage(q: AiQuota, feature: AiFeature): string | null {
  const reason = aiBlockReason(q, feature);
  const name = AI_FEATURE_NAME[feature];
  const f = q.features[feature];
  switch (reason) {
    case 'paused':
      return PAUSED_MESSAGE;
    case 'blocked':
      return 'A análise por IA não está disponível para a sua conta no momento. Você continua podendo registrar por busca, código de barras ou manual.';
    case 'monthly':
      return `Você chegou ao limite de ${q.monthly.limit} usos de IA deste mês. Eles voltam em ${ddmm(q.monthly.resetsAt)}. Enquanto isso, você continua podendo registrar por busca, código de barras ou manual.`;
    case 'daily': {
      const subject = f.limit === 1 ? `a única ${name.one}` : `as ${f.limit} ${name.many}`;
      return `Você usou ${subject} de hoje. Elas voltam amanhã às ${hhmm(f.resetsAt)}. Enquanto isso, ${name.alt}.`;
    }
    default:
      return null;
  }
}

/** A dica "Restam N …" só aparece quando restam poucas (3 ou menos, ou 30% do limite). */
export function showQuotaHint(q: AiQuota | undefined, feature: AiFeature): { left: number } | null {
  if (!q || q.paused) return null;
  const left = aiLeft(q, feature);
  const limit = q.features[feature].limit;
  if (left === null || left <= 0 || limit <= 0) return null;
  return left <= 3 || left <= limit * 0.3 ? { left } : null;
}

export function quotaHintText(left: number, feature: AiFeature): string {
  const n = AI_FEATURE_NAME[feature];
  return left === 1 ? `Resta 1 ${n.one} hoje` : `Restam ${left} ${n.many} hoje`;
}

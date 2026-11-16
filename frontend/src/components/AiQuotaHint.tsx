'use client';

import { useSWRConfig } from 'swr';
import { type AiFeature, aiBlockMessage, aiBlockReason, quotaHintText, showQuotaHint } from '@/lib/aiQuota';
import { useAiQuota } from '@/lib/hooks';

/** Revalida a cota depois de qualquer chamada de IA (sucesso, falha ou 429). */
export function useRefreshAiQuota() {
  const { mutate } = useSWRConfig();
  return () => void mutate('/ai/quota');
}

/** "Restam 2 análises por foto hoje": discreto, só quando restam poucas. */
export function AiQuotaHint({ feature }: { feature: AiFeature }) {
  const { data } = useAiQuota();
  const hint = showQuotaHint(data, feature);
  if (!hint) return null;
  return (
    <p className="caption ai-hint" role="status">
      {quotaHintText(hint.left, feature)}
    </p>
  );
}

export interface AiAlternative {
  label: string;
  onClick?: () => void;
  href?: string;
}

/**
 * Cota acabada: a mensagem do servidor (mesma redação) e, logo abaixo, atalhos para o que continua funcionando.
 * Neutro, sem vermelho: a pessoa não fez nada de errado.
 */
export function AiBlockedNotice({ feature, alternatives }: { feature: AiFeature; alternatives: AiAlternative[] }) {
  const { data } = useAiQuota();
  if (!data || !aiBlockReason(data, feature)) return null;
  return (
    <div className="ai-blocked stack" style={{ gap: 10 }}>
      <p className="note" role="status">
        {aiBlockMessage(data, feature)}
      </p>
      <div className="ai-alternatives" role="group" aria-label="Outras formas de registrar">
        {alternatives.map((a) =>
          a.href ? (
            <a key={a.label} className="btn btn-glass" href={a.href}>
              {a.label}
            </a>
          ) : (
            <button key={a.label} type="button" className="btn btn-glass" onClick={a.onClick}>
              {a.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

/** A IA da funcionalidade está bloqueada (cota diária, mensal, pausa do beta ou conta bloqueada)? */
export function useAiBlocked(feature: AiFeature): boolean {
  const { data } = useAiQuota();
  return aiBlockReason(data, feature) !== null;
}

'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { fmtInt } from '@/lib/format';
import { useDisplayPrefs } from '@/lib/display-prefs';
import { tap } from '@/lib/haptics';
import { useAdaptiveStatus, useProfile } from '@/lib/hooks';
import type { AdaptiveConfidence, AdaptiveHistoryItem, AdaptiveNote, AdaptiveStatus, Profile } from '@/lib/types';
import { AdaptiveSheet } from './AdaptiveSheet';
import { ChevronRight } from './Icons';
import { useToast } from './Toast';

const NOTE_TEXT: Record<AdaptiveNote, string> = {
  under18: 'Este recurso é para maiores de 18 anos.',
  underweight_loss:
    'Com o seu peso atual, o Bocado não sugere reduzir calorias. Vale conversar com um nutricionista ou médico.',
  fast_loss:
    'Seu peso variou rápido nas últimas semanas, então não sugerimos reduzir mais as calorias. Se estiver difícil, vale conversar com um profissional.',
  low_intake:
    'A média registrada ficou abaixo do mínimo que o Bocado usa nas metas. Se você registrou tudo, vale conversar com um nutricionista ou médico.',
};

const CONFIDENCE_LABEL: Record<AdaptiveConfidence, string> = { LOW: 'baixa', MEDIUM: 'média', HIGH: 'alta' };

const shortDate = (iso: string) => new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(new Date(iso)).replace('.', '');

/** Perfil: meta adaptativa. Sugere ajustes da meta pelo gasto estimado; só muda a meta com a confirmação da pessoa. */
export function AdaptiveSection() {
  const toast = useToast();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: profile, mutate: mutateProfile } = useProfile();
  const { data: status } = useAdaptiveStatus(!!profile);
  const { data: history } = useSWR<AdaptiveHistoryItem[]>(profile ? '/adaptive/history?limit=10' : null, { revalidateOnFocus: false });
  const [open, setOpen] = useState(false);
  const { hideCalories: hide } = useDisplayPrefs();

  if (!profile) return null;

  async function toggle(adaptiveEnabled: boolean) {
    if (!profile) return;
    tap();
    await mutateProfile(
      async () => api<Profile>('/profile/preferences', { method: 'PATCH', json: { adaptiveEnabled } }),
      { optimisticData: { ...profile, adaptiveEnabled }, rollbackOnError: true, revalidate: false },
    )
      .then(() => globalMutate((key) => typeof key === 'string' && key.startsWith('/adaptive')))
      .catch((err) => toast.show({ message: errorMessage(err), tone: 'error' }));
  }

  const under18 = status?.notes.includes('under18');

  // Com "esconder calorias" a meta adaptativa fica em espera: nada é sugerido nem aplicado. Ao voltar, tudo continua como estava
  if (hide) {
    return (
      <section className="card glass stack" aria-labelledby="adaptive-title">
        <h3 className="headline" id="adaptive-title">
          Meta adaptativa
        </h3>
        <p className="body-2">Disponível quando as calorias estão visíveis.</p>
      </section>
    );
  }

  return (
    <section className="card glass stack" aria-labelledby="adaptive-title">
      <h3 className="headline" id="adaptive-title">
        Meta adaptativa
      </h3>

      {under18 ? (
        <p className="body-2">{NOTE_TEXT.under18}</p>
      ) : (
        <>
          <label className="switch-row">
            <span>Sugerir ajustes na minha meta</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={profile.adaptiveEnabled}
              onChange={(e) => void toggle(e.target.checked)}
            />
          </label>
          <p className="caption">
            Com o tempo, o Bocado compara o que você registra com a variação do seu peso para estimar o seu gasto real e sugerir
            um ajuste na meta. Nada muda sem a sua confirmação.
          </p>
        </>
      )}

      {!under18 && profile.adaptiveEnabled && <StatusBlock status={status} onOpen={() => setOpen(true)} />}

      {history && history.length > 0 && (
        <div className="stack-sm">
          <h4 className="caption">Últimos ajustes</h4>
          <ul className="list adaptive-history">
            {history.map((h) => (
              <li key={h.id} className="list-row">
                <span className="list-row-main">
                  <span className="list-row-title">
                    {h.action === 'APPLIED' && h.newKcal !== null
                      ? `${fmtInt(h.previousKcal)} → ${fmtInt(h.newKcal)} kcal`
                      : h.action === 'SNOOZED'
                        ? 'Adiado'
                        : `Mantida em ${fmtInt(h.previousKcal)} kcal`}
                  </span>
                  <span className="list-row-sub">
                    {shortDate(h.createdAt)} · gasto estimado {fmtInt(h.estimatedTdee)} kcal · confiança {CONFIDENCE_LABEL[h.confidence]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {open && <AdaptiveSheet onClose={() => setOpen(false)} />}
    </section>
  );
}

function StatusBlock({ status, onOpen }: { status: AdaptiveStatus | undefined; onOpen: () => void }) {
  if (!status) return <div className="skeleton" style={{ height: 52 }} aria-busy="true" />;

  if (status.state === 'collecting') {
    const p = status.progress;
    const ratio = Math.min(
      1,
      (Math.min(p.usableDays / p.needed.usableDays, 1) + Math.min(p.weighIns / p.needed.weighIns, 1) + Math.min(p.daysSinceStart / p.needed.daysSinceStart, 1)) / 3,
    );
    return (
      <div className="stack-sm">
        <p className="body-2">Ainda coletando dados</p>
        <div
          className="adaptive-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
          aria-label="Progresso da coleta de dados"
        >
          <span style={{ width: `${Math.round(ratio * 100)}%` }} />
        </div>
        <p className="caption">
          {Math.min(p.usableDays, p.needed.usableDays)} de {p.needed.usableDays} dias registrados · {Math.min(p.weighIns, p.needed.weighIns)} de{' '}
          {p.needed.weighIns} pesagens
          {p.daysSinceStart < p.needed.daysSinceStart && ` · ${p.daysSinceStart} de ${p.needed.daysSinceStart} dias de histórico`}
        </p>
        <p className="caption">Registre as refeições e pese-se com regularidade, de preferência algumas vezes por semana.</p>
      </div>
    );
  }

  if (status.state === 'paused') {
    return <p className="body-2">Sem novas sugestões por enquanto. Avisamos de novo quando houver dados novos.</p>;
  }

  if (status.state === 'suggestion' && status.suggestion && status.estimate) {
    const s = status.suggestion;
    return (
      <div className="stack-sm">
        <div className="adaptive-compare">
          <div className="stat">
            <span className="caption">Meta atual</span>
            <strong>{fmtInt(s.currentKcal)}</strong>
          </div>
          <span aria-hidden className="adaptive-arrow">
            →
          </span>
          <div className="stat">
            <span className="caption">Sugerida</span>
            <strong>{fmtInt(s.newKcal)}</strong>
          </div>
        </div>
        <p className="caption">
          Gasto estimado: {fmtInt(status.estimate.tdee)} kcal por dia · confiança {CONFIDENCE_LABEL[status.estimate.confidence]}
        </p>
        <button type="button" className="btn btn-glass btn-block" onClick={onOpen}>
          Ver detalhes
          <ChevronRight width={16} height={16} />
        </button>
      </div>
    );
  }

  // no_change: sem sugestão. Com notas de segurança, mostra as notas; sem elas, a meta está alinhada.
  if (status.notes.length > 0) {
    return (
      <div className="stack-sm">
        {status.notes.map((n) => (
          <p key={n} className="note">
            {NOTE_TEXT[n]}
          </p>
        ))}
      </div>
    );
  }
  return <p className="body-2">Sua meta está alinhada com o seu gasto estimado.</p>;
}

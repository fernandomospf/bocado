'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './Toast';

type Feature = 'PHOTO' | 'TEXT' | 'LABEL' | 'SUGGEST';
interface AiUsage {
  days: number;
  paused: boolean;
  month: {
    calls: number;
    inputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number | null;
    budgetUsd?: number;
    percentOfBudget?: number;
    projectedCostUsd?: number;
    budgetActive: boolean;
    pricesConfigured: boolean;
    models: string[];
  };
  byFeature: { feature: Feature; model: string; calls: number; failed: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null }[];
  byUser: { userId: string; label: string; calls: number; tokens: number; estimatedCostUsd: number | null; aiLimitFactor: number; unlimited: boolean }[];
  perActiveUser: { activeUsers: number; averageCallsMonth: number; averageCostUsd: number | null };
  cacheHits: { text: number; suggest: number };
}

const FEATURE_LABEL: Record<Feature, string> = { PHOTO: 'Foto', TEXT: 'Descrição', LABEL: 'Rótulo', SUGGEST: 'Sugestão' };
const PRICING_URL = 'https://www.anthropic.com/pricing';
const int = new Intl.NumberFormat('pt-BR');
const usd = (n: number) => `US$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 4 : 2 })}`;

/** Custo, ou o aviso de que os preços não estão configurados (nunca um número inventado). */
function Cost({ value }: { value: number | null }) {
  return value === null ? <span className="caption">não configurado</span> : <span className="num">{usd(value)}</span>;
}

const PERIODS = [
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
  { days: 90, label: '90 dias' },
] as const;

/** Aba "Uso de IA" do /admin: chamadas, tokens e custo estimado. Sem conteúdo e com e-mails mascarados. */
export function AdminAiTab() {
  const [days, setDays] = useState<number>(30);
  const { data, error } = useSWR<AiUsage>(`/admin/ai/usage?days=${days}`);
  if (error) {
    return (
      <p className="alert" role="alert">
        {error.message}
      </p>
    );
  }
  if (!data) return <div className="skeleton" style={{ height: 160 }} />;

  const m = data.month;
  const over80 = m.percentOfBudget !== undefined && m.percentOfBudget >= 80;
  const cards = [
    { label: 'Chamadas no mês', value: int.format(m.calls) },
    { label: 'Tokens no mês', value: int.format(m.inputTokens + m.outputTokens), hint: `${int.format(m.inputTokens)} entrada · ${int.format(m.outputTokens)} saída` },
    { label: 'Custo estimado', node: <Cost value={m.estimatedCostUsd} /> },
    ...(m.percentOfBudget !== undefined ? [{ label: 'Do orçamento', value: `${m.percentOfBudget.toLocaleString('pt-BR')}%`, hint: m.budgetUsd ? `de ${usd(m.budgetUsd)}` : undefined }] : []),
    ...(m.projectedCostUsd !== undefined ? [{ label: 'Projeção até o fim do mês', value: usd(m.projectedCostUsd) }] : []),
    { label: 'Custo médio por usuário ativo', node: <Cost value={data.perActiveUser.averageCostUsd} />, hint: `${data.perActiveUser.activeUsers} ativos · ${data.perActiveUser.averageCallsMonth.toLocaleString('pt-BR')} chamadas em média` },
  ];

  return (
    <section className="stack" aria-label="Uso de IA">
      {data.paused && (
        <p className="note" role="status">
          A IA está em pausa: o orçamento do mês foi atingido. Quem usa o app segue podendo registrar por busca, código de barras ou manual.
        </p>
      )}
      {over80 && !data.paused && (
        <p className="note" role="status">
          O mês passou de 80% do orçamento. Se chegar a 100%, a IA entra em pausa até o mês seguinte.
        </p>
      )}
      {m.estimatedCostUsd === null && (
        <p className="note" role="status">
          Configure <code>AI_PRICES_JSON</code> com os preços oficiais dos modelos ({m.models.join(', ')}) para ver o custo e ativar o orçamento em dólares.{' '}
          <a className="text-link" href={PRICING_URL} target="_blank" rel="noopener noreferrer">
            Página de preços da Anthropic
          </a>
          .
        </p>
      )}

      <div className="admin-stats">
        {cards.map((c) => (
          <div key={c.label} className="card glass stat">
            <span className="caption">{c.label}</span>
            <strong className="num" style={{ fontSize: 24 }}>
              {c.node ?? c.value}
            </strong>
            {c.hint && <span className="caption">{c.hint}</span>}
          </div>
        ))}
      </div>

      <div className="segmented" role="group" aria-label="Período das tabelas">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => setDays(p.days)}>
            {p.label}
          </button>
        ))}
      </div>

      <h2 className="section-title">Por funcionalidade</h2>
      <table className="adm-table card glass">
        <thead>
          <tr>
            <th scope="col">Funcionalidade</th>
            <th scope="col">Modelo</th>
            <th scope="col">Chamadas</th>
            <th scope="col">Falhas</th>
            <th scope="col">Tokens (entrada/saída)</th>
            <th scope="col">Custo</th>
          </tr>
        </thead>
        <tbody>
          {data.byFeature.map((f) => (
            <tr key={f.feature}>
              <td>{FEATURE_LABEL[f.feature]}</td>
              <td className="caption">{f.model}</td>
              <td className="num">{int.format(f.calls)}</td>
              <td className="num">{int.format(f.failed)}</td>
              <td className="num">
                {int.format(f.inputTokens)} / {int.format(f.outputTokens)}
              </td>
              <td>
                <Cost value={f.estimatedCostUsd} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="adm-cards">
        {data.byFeature.map((f) => (
          <li key={f.feature} className="card glass stack-sm">
            <div className="spread">
              <strong>{FEATURE_LABEL[f.feature]}</strong>
              <Cost value={f.estimatedCostUsd} />
            </div>
            <p className="caption num">
              {int.format(f.calls)} chamadas · {int.format(f.failed)} falhas · {int.format(f.inputTokens + f.outputTokens)} tokens
            </p>
            <p className="caption">{f.model}</p>
          </li>
        ))}
      </ul>

      <h2 className="section-title">Por usuário</h2>
      {data.byUser.length === 0 ? (
        <p className="caption">Nenhum uso no período.</p>
      ) : (
        <>
          <table className="adm-table card glass">
            <thead>
              <tr>
                <th scope="col">Usuário</th>
                <th scope="col">Chamadas</th>
                <th scope="col">Tokens</th>
                <th scope="col">Custo</th>
                <th scope="col">Fator de limite</th>
              </tr>
            </thead>
            <tbody>
              {data.byUser.map((u) => (
                <tr key={u.userId}>
                  <td>{u.label}</td>
                  <td className="num">{int.format(u.calls)}</td>
                  <td className="num">{int.format(u.tokens)}</td>
                  <td>
                    <Cost value={u.estimatedCostUsd} />
                  </td>
                  <td>
                    <FactorEditor user={u} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="adm-cards">
            {data.byUser.map((u) => (
              <li key={u.userId} className="card glass stack-sm">
                <div className="spread">
                  <strong>{u.label}</strong>
                  <Cost value={u.estimatedCostUsd} />
                </div>
                <p className="caption num">
                  {int.format(u.calls)} chamadas · {int.format(u.tokens)} tokens
                </p>
                <FactorEditor user={u} />
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="caption">
        Acertos de cache (acumulado): descrições {int.format(data.cacheHits.text)} · sugestões {int.format(data.cacheHits.suggest)}. Cada acerto é uma chamada
        a menos à IA.
      </p>
    </section>
  );
}

/** Fator dos limites da pessoa (0 bloqueia a IA, 1 é o padrão, 2 dobra). Admins aparecem como "ilimitado". */
function FactorEditor({ user }: { user: AiUsage['byUser'][number] }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [value, setValue] = useState(String(user.aiLimitFactor));
  const [busy, setBusy] = useState(false);
  const factor = Number(value.replace(',', '.'));
  const valid = value.trim() !== '' && Number.isFinite(factor) && factor >= 0 && factor <= 10;
  const dirty = valid && factor !== user.aiLimitFactor;

  async function save() {
    setBusy(true);
    try {
      await api(`/admin/users/${user.userId}/ai-limit`, { method: 'PATCH', json: { factor } });
      toast.show({ message: 'Fator atualizado', durationMs: 2000 });
      void mutate((key) => typeof key === 'string' && key.startsWith('/admin/ai/'));
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="admin-actions">
      {user.unlimited && <span className="badge">ilimitado</span>}
      <input
        className="input num"
        style={{ width: 84, minHeight: 44 }}
        inputMode="decimal"
        aria-label={`Fator de limite de ${user.label}`}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^0-9.,]/g, ''))}
      />
      <button type="button" className="btn btn-glass btn-sm" disabled={!dirty || busy} onClick={() => void save()}>
        Salvar
      </button>
    </span>
  );
}

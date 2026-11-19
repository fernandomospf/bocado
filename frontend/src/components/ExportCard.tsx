'use client';

import { useId, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { addDays, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { saveFile } from '@/lib/saveFile';
import { useProfile } from '@/lib/hooks';
import { useSupplementsEnabled } from '@/lib/useSupplements';
import { useToast } from './Toast';

type Kind = 'meals' | 'weight' | 'water' | 'supplements' | 'fasting' | 'wellbeing';
type Period = '7d' | '15d' | '30d' | '90d' | '180d' | '365d';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'meals', label: 'Refeições' },
  { value: 'weight', label: 'Peso' },
  { value: 'water', label: 'Água' },
];

const PERIODS: { value: Period; days: number; label: string }[] = [
  { value: '7d', days: 7, label: '7 dias' },
  { value: '15d', days: 15, label: '15 dias' },
  { value: '30d', days: 30, label: '1 mês' },
  { value: '90d', days: 90, label: '3 meses' },
  { value: '180d', days: 180, label: '6 meses' },
  { value: '365d', days: 365, label: 'Último ano' },
];

const EMPTY: Record<Kind, string> = {
  meals: 'Nenhuma refeição nesse período',
  weight: 'Nenhum registro de peso nesse período',
  water: 'Nenhum registro de água nesse período',
  supplements: 'Nenhum registro de suplementos e medicações nesse período',
  fasting: 'Nenhuma janela de jejum nesse período',
  wellbeing: 'Nenhum registro de bem-estar nesse período',
};

const FILE: Record<Kind, { path: string; name: string }> = {
  meals: { path: 'meals', name: 'refeicoes' },
  weight: { path: 'weight', name: 'peso' },
  water: { path: 'water', name: 'agua' },
  supplements: { path: 'supplements', name: 'suplementos' },
  fasting: { path: 'fasting', name: 'jejum' },
  wellbeing: { path: 'wellbeing', name: 'bem-estar' },
};

/** Conjuntos sensíveis: cada um tem a rota de resumo própria e a chave da contagem. */
const SENSITIVE_COUNT: Partial<Record<Kind, string>> = { supplements: 'supplements', fasting: 'fasting', wellbeing: 'wellbeing' };

const br = (iso: string) => iso.split('-').reverse().join('/');

/** Exportar refeições, peso ou água em CSV (para o Excel/LibreOffice em português). */
export function ExportCard({ hasWeight = true }: { hasWeight?: boolean }) {
  const id = useId();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('meals');
  const [period, setPeriod] = useState<Period>('30d');
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);
  // Dado sensível: só existe com o módulo ativo, começa DESLIGADO e nunca é marcado sozinho (nem lembrado)
  const supplementsOn = useSupplementsEnabled();
  const [includeSupplements, setIncludeSupplements] = useState(false);
  // Jejum e bem-estar: também sensíveis, desligados por padrão e nunca marcados sozinhos
  const { data: profile } = useProfile();
  const adult = !!profile && profile.age >= 18;
  const fastingOn = adult && !!profile?.fastingEnabled;
  const wellbeingOn = adult && (!!profile?.glp1Mode || !!profile?.supplementsEnabled);
  const [includeFasting, setIncludeFasting] = useState(false);
  const [includeWellbeing, setIncludeWellbeing] = useState(false);

  const to = todayISO();
  const from = addDays(to, -((PERIODS.find((p) => p.value === period)?.days ?? 30) - 1));
  const baseKinds = hasWeight ? KINDS : KINDS.filter((k) => k.value !== 'weight');
  const kinds: { value: Kind; label: string }[] = [
    ...baseKinds,
    ...(supplementsOn && includeSupplements ? [{ value: 'supplements' as const, label: 'Suplementos' }] : []),
    ...(fastingOn && includeFasting ? [{ value: 'fasting' as const, label: 'Jejum' }] : []),
    ...(wellbeingOn && includeWellbeing ? [{ value: 'wellbeing' as const, label: 'Bem-estar' }] : []),
  ];

  async function download() {
    setBusy(true);
    setEmpty(null);
    try {
      const query = `period=${period}&to=${to}`;
      // Antes de baixar: o período tem registros?
      const sensitiveKey = SENSITIVE_COUNT[kind];
      const total = sensitiveKey
        ? ((await api<Record<string, number>>(`/export/${FILE[kind].path}/summary?${query}`))[sensitiveKey] ?? 0)
        : await api<{ items: number; weights: number; water?: number }>(`/export/summary?${query}`).then((count) =>
              kind === 'meals' ? count.items : kind === 'weight' ? count.weights : (count.water ?? 0),
            );
      if (total === 0) {
        setEmpty(EMPTY[kind]);
        return;
      }

      const res = await fetch(`/api/export/${FILE[kind].path}.csv?${query}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, data?.message ?? 'Não foi possível gerar o arquivo. Tente de novo.');
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
        `bocado-${FILE[kind].name}-${from}_a_${to}.csv`;
      await saveFile(await res.blob(), name);
      toast.show({ message: 'CSV baixado' });
    } catch (err) {
      // Fechar a folha de compartilhar do iOS não é erro
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        toast.show({ message: errorMessage(err), tone: 'error' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    // tabIndex -1: o atalho "Exportar meus dados antes" (Excluir conta) leva o foco até aqui
    <section id="exportar" tabIndex={-1} className="card glass stack-lg" aria-labelledby={`${id}-title`}>
      <div className="stack" style={{ gap: 4 }}>
        <h3 className="headline" id={`${id}-title`}>
          Exportar dados
        </h3>
        <p className="caption">Arquivo CSV, abre no Excel, LibreOffice ou Google Planilhas.</p>
      </div>

      {supplementsOn && (
        <div className="stack-sm">
          <label className="switch-row">
            <span>Incluir suplementos e medicações (dado sensível)</span>
            <input
              type="checkbox"
              role="switch"
              className="switch"
              checked={includeSupplements}
              onChange={(e) => {
                setIncludeSupplements(e.target.checked);
                setEmpty(null);
                setKind(e.target.checked ? 'supplements' : 'meals');
              }}
            />
          </label>
          {includeSupplements && <p className="caption">O arquivo sai com os nomes que você cadastrou e fica só no seu aparelho.</p>}
        </div>
      )}

      {(fastingOn || wellbeingOn) && (
        <div className="stack-sm">
          {fastingOn && (
            <label className="switch-row">
              <span>Incluir jejum (dado sensível)</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={includeFasting}
                onChange={(e) => {
                  setIncludeFasting(e.target.checked);
                  setEmpty(null);
                  setKind(e.target.checked ? 'fasting' : 'meals');
                }}
              />
            </label>
          )}
          {wellbeingOn && (
            <label className="switch-row">
              <span>Incluir bem-estar (dado sensível)</span>
              <input
                type="checkbox"
                role="switch"
                className="switch"
                checked={includeWellbeing}
                onChange={(e) => {
                  setIncludeWellbeing(e.target.checked);
                  setEmpty(null);
                  setKind(e.target.checked ? 'wellbeing' : 'meals');
                }}
              />
            </label>
          )}
          {(includeFasting || includeWellbeing) && <p className="caption">Esses arquivos saem só com o que você registrou e ficam só no seu aparelho.</p>}
        </div>
      )}

      {kinds.length > 1 && (
        <div className="field">
          <span className="field-label" id={`${id}-kind`}>
            O que exportar
          </span>
          <div className={kinds.length > 3 ? 'segmented segmented-2col' : 'segmented'} role="group" aria-labelledby={`${id}-kind`}>
            {kinds.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kind === k.value}
                onClick={() => {
                  if (k.value !== kind) tap();
                  setKind(k.value);
                  setEmpty(null);
                }}
              >
                {k.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <span className="field-label" id={`${id}-period`}>
          Período
        </span>
        <div className="fat-chips" role="group" aria-labelledby={`${id}-period`}>
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              className="chip chip-toggle"
              aria-pressed={period === p.value}
              onClick={() => {
                if (p.value !== period) tap();
                setPeriod(p.value);
                setEmpty(null);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="caption num" style={{ paddingLeft: 4 }}>
          {br(from)} a {br(to)}
        </p>
      </div>

      <p className="note" role="status" hidden={!empty}>
        {empty}
      </p>

      <button type="button" className="btn btn-primary btn-block" onClick={download} disabled={busy}>
        {busy ? <span className="spinner" aria-hidden /> : null}
        {busy ? 'Gerando arquivo' : 'Baixar CSV'}
      </button>
    </section>
  );
}

'use client';

import { useId, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { addDays, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { useToast } from './Toast';

type Kind = 'meals' | 'weight';
type Period = '7d' | '15d' | '30d' | '90d' | '180d' | '365d';

const KINDS: { value: Kind; label: string }[] = [
  { value: 'meals', label: 'Refeições' },
  { value: 'weight', label: 'Peso' },
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
};

const br = (iso: string) => iso.split('-').reverse().join('/');

/** iPhone/iPad (inclusive iPad que se apresenta como Mac): lá o <a download> não salva o arquivo num PWA. */
const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Salva o arquivo: no iOS, pela folha de compartilhar (quando disponível); no resto, com um link de download. */
async function saveFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: 'text/csv' });
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: filename });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Exportar refeições ou peso em CSV (para o Excel/LibreOffice em português). */
export function ExportCard({ hasWeight = true }: { hasWeight?: boolean }) {
  const id = useId();
  const toast = useToast();
  const [kind, setKind] = useState<Kind>('meals');
  const [period, setPeriod] = useState<Period>('30d');
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState<string | null>(null);

  const to = todayISO();
  const from = addDays(to, -((PERIODS.find((p) => p.value === period)?.days ?? 30) - 1));
  const kinds = hasWeight ? KINDS : KINDS.filter((k) => k.value === 'meals');

  async function download() {
    setBusy(true);
    setEmpty(null);
    try {
      const query = `period=${period}&to=${to}`;
      // Antes de baixar: o período tem registros?
      const count = await api<{ items: number; weights: number }>(`/export/summary?${query}`);
      if ((kind === 'meals' ? count.items : count.weights) === 0) {
        setEmpty(EMPTY[kind]);
        return;
      }

      const res = await fetch(`/api/export/${kind === 'meals' ? 'meals' : 'weight'}.csv?${query}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, data?.message ?? 'Não foi possível gerar o arquivo. Tente de novo.');
      }
      const name =
        /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ??
        `bocado-${kind === 'meals' ? 'refeicoes' : 'peso'}-${from}_a_${to}.csv`;
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

      {kinds.length > 1 && (
        <div className="field">
          <span className="field-label" id={`${id}-kind`}>
            O que exportar
          </span>
          <div className="segmented" role="group" aria-labelledby={`${id}-kind`}>
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

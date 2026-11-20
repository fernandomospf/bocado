'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { type NutritionistData, ReportScreen } from './NutritionistReport';

type View = { state: 'code' } | { state: 'report'; report: NutritionistData };

/**
 * Página pública do relatório (/r/<token>), sem sessão. Sem o cookie de aparelho só mostra o formulário do código; o
 * código certo libera ESTE aparelho (se houver vaga) e a página recarrega com o relatório. O código nunca é guardado aqui.
 */
export function PublicReport({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/public/reports/${encodeURIComponent(token)}`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(base, { credentials: 'same-origin', cache: 'no-store' });
      setView(res.ok ? ((await res.json()) as View) : { state: 'code' });
    } catch {
      setError('Não foi possível carregar agora. Tente de novo.');
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${base}/unlock`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string | string[] } | null;
        setError((Array.isArray(body?.message) ? body?.message[0] : body?.message) ?? 'Código incorreto ou link indisponível.');
        setBusy(false);
        return;
      }
      setCode('');
      await load();
    } catch {
      setError('Não foi possível verificar agora. Tente de novo.');
    }
    setBusy(false);
  }

  if (!view) {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" aria-label="Carregando" />
      </div>
    );
  }

  if (view.state === 'report') {
    return <ReportScreen data={view.report} pdfUrl={`${base}/pdf`} />;
  }

  return (
    <main className="screen screen-narrow screen-center">
      <form className="card glass stack-lg" onSubmit={unlock} aria-labelledby="pub-title">
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="large-title" id="pub-title">
            Relatório de alimentação
          </h1>
          <p className="body-2">Digite o código de acesso que a pessoa enviou separado do link.</p>
        </div>
        <label className="field">
          <span className="field-label">Código de acesso</span>
          <input
            className="input num"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            inputMode="text"
            maxLength={12}
            aria-describedby={error ? 'pub-error' : undefined}
            aria-invalid={!!error}
            required
          />
        </label>
        {error && (
          <p className="alert" role="alert" id="pub-error">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy || code.trim().length < 8}>
          {busy ? <span className="spinner" aria-label="Verificando" /> : 'Abrir relatório'}
        </button>
        <p className="caption">Cada código abre o relatório em um número limitado de aparelhos.</p>
      </form>
    </main>
  );
}

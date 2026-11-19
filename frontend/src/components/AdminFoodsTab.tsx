'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './Toast';
import { VerifiedBadge } from './VerifiedBadge';

interface DupItem {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: 'OFF' | 'LABEL';
  status: 'ACTIVE' | 'REPORTED';
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  serving: { grams: number; label: string | null } | null;
  verifyCount: number;
  verified: boolean;
  reportCount: number;
}
interface DupGroup {
  reasons: ('barcode' | 'name')[];
  items: DupItem[];
}

const REASON: Record<'barcode' | 'name', string> = { barcode: 'mesmo código de barras', name: 'nome e valores parecidos' };
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Admin > Acervo: possíveis duplicados de produtos, com "Unir" (o canônico fica; os outros viram MERGED, sem apagar nada). */
export function AdminFoodsTab() {
  const { data, error, isLoading } = useSWR<{ groups: DupGroup[] }>('/admin/foods/duplicates', { revalidateOnFocus: false });

  if (error) return <p className="alert" role="alert">{error.message}</p>;
  if (isLoading || !data) return <div className="skeleton" style={{ height: 120 }} />;

  return (
    <section className="stack">
      <p className="caption">
        Possíveis duplicados do acervo: mesmo código de barras, ou nome + marca parecidos com valores por 100 g a até 5% de diferença.
        Unir não apaga nada: os outros produtos ficam marcados como unidos e a busca leva ao produto que você escolher.
      </p>
      {data.groups.length === 0 ? (
        <p className="caption">Nenhum possível duplicado agora.</p>
      ) : (
        data.groups.map((g) => <Group key={g.items.map((i) => i.id).join('-')} group={g} />)
      )}
    </section>
  );
}

function Group({ group }: { group: DupGroup }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  // O canônico sugerido: o mais verificado, depois o com mais confirmações
  const suggested = [...group.items].sort((a, b) => b.verifyCount - a.verifyCount)[0]?.id ?? group.items[0].id;
  const [canonical, setCanonical] = useState(suggested);
  const [busy, setBusy] = useState(false);

  async function merge() {
    setBusy(true);
    try {
      await api('/admin/foods/merge', {
        method: 'POST',
        json: { canonicalId: canonical, mergeIds: group.items.map((i) => i.id).filter((id) => id !== canonical) },
      });
      toast.show({ message: 'Produtos unidos' });
      await mutate('/admin/foods/duplicates');
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
      setBusy(false);
    }
  }

  return (
    <div className="card glass stack-sm">
      <p className="caption">{group.reasons.map((r) => REASON[r]).join(' · ')}</p>
      <div role="radiogroup" aria-label="Produto canônico" className="stack-sm">
        {group.items.map((i) => (
          <label key={i.id} className="adm-dup-item">
            <input type="radio" name={`canon-${group.items[0].id}`} checked={canonical === i.id} onChange={() => setCanonical(i.id)} />
            <span className="list-row-main">
              <span className="list-row-title">
                {i.name} {i.verified && <VerifiedBadge />}
              </span>
              <span className="list-row-sub num">
                {[i.brand, i.barcode, i.source === 'OFF' ? 'Open Food Facts' : 'Rótulo'].filter(Boolean).join(' · ')}
              </span>
              <span className="list-row-sub num">
                {num.format(i.per100.kcal)} kcal · P {num.format(i.per100.protein)} · C {num.format(i.per100.carbs)} · G {num.format(i.per100.fat)} (100 g)
                · {i.verifyCount} {i.verifyCount === 1 ? 'confirmação' : 'confirmações'}
                {i.reportCount > 0 ? ` · ${i.reportCount} ${i.reportCount === 1 ? 'denúncia' : 'denúncias'}` : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
      <button type="button" className="btn btn-primary" disabled={busy} onClick={merge}>
        {busy ? <span className="spinner" aria-label="Unindo" /> : 'Unir'}
      </button>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { todayISO } from '@/lib/date';
import { useProfile } from '@/lib/hooks';
import { activePlans, archivedPlans, doseText, frequencyText, MAX_ACTIVE_PLANS, SUPPLEMENTS_PRINCIPLES, whenText } from '@/lib/supplements';
import { useSupplementPlans, useSupplementsEnabled } from '@/lib/useSupplements';
import type { SupplementPlan } from '@/lib/types';
import { CapsuleIcon, ChevronRight, PlusIcon } from './Icons';
import { SupplementEditor } from './SupplementEditor';

/** Fora da TabBar: o acesso é pelo Perfil (Gerenciar), pelo "+" e pela Hoje. Lista de itens ativos e arquivados. */
export function SupplementsView() {
  const router = useRouter();
  const params = useSearchParams();
  const { data: profile } = useProfile();
  const enabled = useSupplementsEnabled();
  const { data, error } = useSupplementPlans();
  const [creating, setCreating] = useState(params.get('new') === '1');
  const [dismissed, setDismissed] = useState<string | null>(null);

  const plans = useMemo(() => data?.plans ?? [], [data]);
  const active = activePlans(plans);
  const archived = archivedPlans(plans);
  const ownNames = useMemo(() => [...new Set(plans.map((p) => p.name))], [plans]);
  const today = todayISO();

  // "Ver histórico" na Hoje chega aqui com ?plan=<id>: abre o item
  const planParam = params.get('plan');
  const selected = plans.find((p) => p.id === planParam && p.id !== dismissed) ?? null;
  const [editing, setEditing] = useState<SupplementPlan | null>(null);
  const current = editing ?? selected;

  function closeEditor() {
    setEditing(null);
    setCreating(false);
    if (planParam) {
      setDismissed(planParam);
      router.replace('/supplements', { scroll: false });
    }
  }

  if (profile && !enabled) {
    return (
      <main className="screen screen-plain">
        <h1 className="large-title">Suplementos e medicações</h1>
        <section className="card glass stack">
          <p className="body-2">{profile.age < 18 ? 'Este recurso não está disponível para menores de 18 anos.' : 'Este registro está desligado.'}</p>
          {profile.age >= 18 && (
            <Link href="/profile#suplementos" className="btn btn-glass">
              Ativar no Perfil
            </Link>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="screen screen-plain">
      <header className="stack" style={{ gap: 8 }}>
        <Link href="/profile#suplementos" className="text-link" style={{ alignSelf: 'flex-start' }}>
          ← Perfil
        </Link>
        <div className="spread" style={{ alignItems: 'center', gap: 12 }}>
          <h1 className="large-title" style={{ minWidth: 0 }}>
            Suplementos e medicações
          </h1>
        </div>
        <p className="caption">{SUPPLEMENTS_PRINCIPLES}</p>
      </header>

      <button type="button" className="btn btn-primary btn-block" onClick={() => setCreating(true)} disabled={active.length >= MAX_ACTIVE_PLANS}>
        <PlusIcon width={20} height={20} />
        Novo
      </button>
      {active.length >= MAX_ACTIVE_PLANS && <p className="caption">Limite de {MAX_ACTIVE_PLANS} itens ativos. Arquive algum para cadastrar outro.</p>}

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}
      {!data && !error && <div className="skeleton" style={{ height: 96 }} />}

      {data && active.length === 0 && (
        <section className="card glass stack" style={{ textAlign: 'center', alignItems: 'center' }}>
          <CapsuleIcon width={28} height={28} />
          <p className="body-2">Cadastre o que você toma para registrar com um toque.</p>
        </section>
      )}

      {active.length > 0 && (
        <section className="stack-sm" aria-label="Itens ativos">
          <div className="list">
            {active.map((p) => (
              <PlanRow key={p.id} plan={p} today={today} onOpen={() => setEditing(p)} />
            ))}
          </div>
        </section>
      )}

      {archived.length > 0 && (
        <section className="stack-sm" aria-labelledby="archived-title">
          <h2 className="section-title" id="archived-title">
            Arquivados
          </h2>
          <div className="list">
            {archived.map((p) => (
              <PlanRow key={p.id} plan={p} today={today} onOpen={() => setEditing(p)} />
            ))}
          </div>
        </section>
      )}

      {(creating || current) && <SupplementEditor key={current?.id ?? 'new'} plan={current ?? undefined} ownNames={ownNames} onClose={closeEditor} />}
    </main>
  );
}

function PlanRow({ plan, today, onOpen }: { plan: SupplementPlan; today: string; onOpen: () => void }) {
  return (
    <button type="button" className="list-row supp-plan-row" onClick={onOpen}>
      <span className="list-row-main">
        <span className="list-row-title" style={{ display: 'block' }}>
          {plan.name}
        </span>
        <span className="list-row-sub supp-plan-sub">
          <span className="num">{doseText(plan.doseAmount, plan.doseUnit, plan.doseUnitLabel)}</span>
          <span>{frequencyText(plan)}</span>
          {!plan.archived && plan.nextDate && <span>Próxima: {whenText(plan.nextDate, today)}</span>}
        </span>
      </span>
      <ChevronRight width={16} height={16} aria-hidden />
    </button>
  );
}

'use client';

import { useMemo } from 'react';
import { todayISO } from '@/lib/date';
import { doseLine, hasPending, nextLine, progressSummary, splitItems, timeText, unloggedLabel, verbFor } from '@/lib/supplements';
import { useHasActiveSupplements, useSupplementDay, useSupplementNames, useSupplementsEnabled } from '@/lib/useSupplements';
import type { SupplementItem } from '@/lib/types';
import { CollapsibleSection } from './CollapsibleSection';
import { CapsuleIcon } from './Icons';
import { Sheet } from './Sheet';
import { useSupplementFlow } from './SupplementSheets';

const TITLE_LONG = 'Suplementos e medicações';

/** Dados do dia para a Hoje e para o estado aberto/fechado (o dropdown abre sozinho com item pendente). */
export function useSupplementsToday(date: string) {
  const enabled = useSupplementsEnabled();
  const hasPlans = useHasActiveSupplements();
  const { data } = useSupplementDay(date, hasPlans);
  const items = useMemo(() => data?.items ?? [], [data]);
  return { enabled: hasPlans && enabled, data, items, pending: hasPending(items) };
}

interface RowProps {
  item: SupplementItem;
  name: string;
  onPrimary: (item: SupplementItem) => void;
  onMore: (item: SupplementItem) => void;
}

/** Uma dose: nome, dose e horário, o botão principal ("Tomei" ou "Apliquei") e o menu "…". Sem vermelho, sem cobrança. */
export function SupplementRow({ item, name, onPrimary, onMore }: RowProps) {
  const done = item.status === 'taken' || item.status === 'skipped';
  const status =
    item.status === 'taken'
      ? `Registrado${item.takenAt ? ` · ${timeText(item.takenAt)}` : ''}`
      : item.status === 'skipped'
        ? 'Pulado desta vez'
        : item.status === 'unlogged'
          ? unloggedLabel(item.dueDate)
          : null;
  return (
    <li className="supp-row" data-status={item.status}>
      <div className="supp-row-main">
        <span className="supp-name">{name}</span>
        <span className="supp-meta num">{doseLine(item)}</span>
        {status && <span className={`supp-status${item.status === 'taken' ? ' is-done' : ''}`}>{status}</span>}
      </div>
      {done ? (
        <span className="supp-done" aria-hidden>
          {item.status === 'taken' ? '✓' : '–'}
        </span>
      ) : (
        <button type="button" className="btn btn-glass supp-primary" onClick={() => onPrimary(item)} aria-label={`${verbFor(item.administration)}: ${name}`}>
          {verbFor(item.administration)}
        </button>
      )}
      <button type="button" className="supp-more" aria-label={`Mais opções: ${name}`} onClick={() => onMore(item)}>
        <span aria-hidden>…</span>
      </button>
    </li>
  );
}

/**
 * Terceiro dropdown da Hoje: "Suplementos e medicações · 2 de 3 registrados". Só existe com o módulo ativo e ao menos um
 * item ativo. Pendências dos 3 dias anteriores ficam em "Dias anteriores" ("Não registrada · seg"), no mesmo tom neutro.
 */
export function SupplementsSection({
  date,
  supp,
  open,
  onToggle,
}: {
  date: string;
  supp: ReturnType<typeof useSupplementsToday>;
  open: boolean;
  onToggle: (open: boolean) => void;
}) {
  const { name } = useSupplementNames();
  const { primary, menu, sheets } = useSupplementFlow(supp.data?.suggestedSites, (i) => name({ id: i.planId, name: i.name }));
  if (!supp.enabled) return null;

  const today = todayISO();
  const { today: todays, earlier } = splitItems(supp.items, date);
  const rowProps = { onPrimary: primary, onMore: menu };
  const next = (supp.data?.next ?? []).slice(0, 3);
  const long = progressSummary(supp.items, date);
  const short = progressSummary(supp.items, date, true);

  return (
    <>
      <CollapsibleSection
        title={
          <>
            <span className="supp-title-long">{TITLE_LONG}</span>
            <span className="supp-title-short">Suplementos</span>
          </>
        }
        summary={
          long ? (
            <>
              <span className="supp-sum-long">{long}</span>
              <span className="supp-sum-short">{short}</span>
            </>
          ) : null
        }
        open={open}
        onToggle={onToggle}
        className="supplements-section"
      >
        <div className="card glass supp-card">
          {todays.length === 0 && earlier.length === 0 && <p className="caption">Nada previsto para este dia.</p>}
          {todays.length > 0 && (
            <ul className="supp-list" aria-label="Doses do dia">
              {todays.map((i) => (
                <SupplementRow key={`${i.planId}-${i.slot}-${i.dueDate}`} item={i} name={name({ id: i.planId, name: i.name })} {...rowProps} />
              ))}
            </ul>
          )}
          {earlier.length > 0 && (
            <>
              <h3 className="supp-subhead">Dias anteriores</h3>
              <ul className="supp-list" aria-label="Dias anteriores">
                {earlier.map((i) => (
                  <SupplementRow key={`${i.planId}-${i.slot}-${i.dueDate}`} item={i} name={name({ id: i.planId, name: i.name })} {...rowProps} />
                ))}
              </ul>
            </>
          )}
          {next.length > 0 && (
            <div className="supp-next">
              {next.map((n) => (
                <p key={n.planId} className="caption">
                  {nextLine(name({ id: n.planId, name: n.name }), n.nextDate, today)}
                </p>
              ))}
            </div>
          )}
        </div>
      </CollapsibleSection>
      {sheets}
    </>
  );
}

/** Folha do botão "+": os itens de hoje (e as pendências recentes), cada um com o seu botão de registro. */
export function SupplementsQuickSheet({ onClose }: { onClose: () => void }) {
  const date = todayISO();
  const { data } = useSupplementDay(date, true);
  const { primary, menu, sheets } = useSupplementFlow(data?.suggestedSites, (i) => i.name);
  const { today: todays, earlier } = splitItems(data?.items ?? [], date);
  return (
    <>
      <Sheet open title="Suplementos e medicações" onClose={onClose}>
        <div className="stack-lg">
          <div className="stack" style={{ gap: 2 }}>
            <h2 className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CapsuleIcon width={22} height={22} /> Suplementos e medicações
            </h2>
            <p className="caption num">{progressSummary(data?.items ?? [], date)}</p>
          </div>
          {!data ? (
            <div className="skeleton" style={{ height: 96 }} />
          ) : (
            <>
              {todays.length === 0 && earlier.length === 0 && <p className="body-2">Nada previsto para hoje.</p>}
              {todays.length > 0 && (
                <ul className="supp-list" aria-label="Doses de hoje">
                  {todays.map((i) => (
                    <SupplementRow key={`${i.planId}-${i.slot}-${i.dueDate}`} item={i} name={i.name} onPrimary={primary} onMore={menu} />
                  ))}
                </ul>
              )}
              {earlier.length > 0 && (
                <>
                  <h3 className="supp-subhead">Dias anteriores</h3>
                  <ul className="supp-list" aria-label="Dias anteriores">
                    {earlier.map((i) => (
                      <SupplementRow key={`${i.planId}-${i.slot}-${i.dueDate}`} item={i} name={i.name} onPrimary={primary} onMore={menu} />
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </Sheet>
      {sheets}
    </>
  );
}

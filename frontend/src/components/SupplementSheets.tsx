'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useId, useState } from 'react';
import { addDays, isValidISO, todayISO } from '@/lib/date';
import {
  doseIsValid,
  doseLine,
  doseText,
  localToISO,
  parseDose,
  SITES,
  timeText,
  unloggedLabel,
} from '@/lib/supplements';
import { useSupplementActions } from '@/lib/useSupplements';
import type { InjectionSite, SupplementItem } from '@/lib/types';
import { Sheet } from './Sheet';

type FlowKind = 'site' | 'when' | 'dose' | 'menu';

/** Primeira sugestão do rodízio quando ainda não há registros (só um ciclo de conveniência). */
const FIRST_SITE: InjectionSite = 'ABDOMEN_L';

/**
 * Toda a interação de um item (a linha da Hoje e a folha do "+"): o toque principal registra na hora (ou abre o local
 * da aplicação), e o menu "…" tem pular, outro horário ou data, mudar a dose desta vez e ver o histórico.
 * Devolve os handlers e as folhas já montadas.
 */
export function useSupplementFlow(suggested: Record<string, InjectionSite> | undefined, nameOf: (item: SupplementItem) => string) {
  const actions = useSupplementActions();
  const [flow, setFlow] = useState<{ kind: FlowKind; item: SupplementItem } | null>(null);
  const close = () => setFlow(null);

  /** Um toque: registra na hora; com "registrar o local" ligado, abre a folha de locais. */
  const primary = (item: SupplementItem) => {
    if (item.status === 'taken' || item.status === 'skipped') return;
    if (item.trackSite) setFlow({ kind: 'site', item });
    else void actions.register(item);
  };
  const menu = (item: SupplementItem) => setFlow({ kind: 'menu', item });

  let sheets: ReactNode = null;
  if (flow) {
    const { item, kind } = flow;
    const name = nameOf(item);
    if (kind === 'site') {
      sheets = (
        <SiteSheet
          item={item}
          name={name}
          suggestion={suggested?.[item.planId] ?? FIRST_SITE}
          onClose={close}
          onRegister={(site) => {
            close();
            void actions.register(item, { site });
          }}
        />
      );
    } else if (kind === 'when') {
      sheets = (
        <WhenSheet
          item={item}
          name={name}
          onClose={close}
          onSubmit={(date, takenAt) => {
            close();
            void actions.register(item, { date, takenAt });
          }}
        />
      );
    } else if (kind === 'dose') {
      sheets = (
        <DoseSheet
          item={item}
          name={name}
          onClose={close}
          onSubmit={(doseAmount) => {
            close();
            void actions.register(item, { doseAmount });
          }}
        />
      );
    } else {
      sheets = (
        <MenuSheet
          item={item}
          name={name}
          onClose={close}
          onPick={(action) => {
            if (action === 'skip') {
              close();
              void actions.skip(item);
            } else if (action === 'undo') {
              close();
              if (item.logId) void actions.removeLog(item.logId);
            } else setFlow({ kind: action, item });
          }}
        />
      );
    }
  }
  return { primary, menu, sheets, actions };
}

// --- local da aplicação ---------------------------------------------------------------------------

function SiteSheet({ item, name, suggestion, onClose, onRegister }: { item: SupplementItem; name: string; suggestion: InjectionSite; onClose: () => void; onRegister: (site: InjectionSite | null) => void }) {
  const id = useId();
  const [site, setSite] = useState<InjectionSite>(suggestion);
  return (
    <Sheet open title="Local da aplicação" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Local da aplicação</h2>
          <p className="caption">
            {name} · {doseLine(item)}
          </p>
        </div>
        <div className="site-grid" role="group" aria-label="Local" id={id}>
          {SITES.map((s) => (
            <button key={s.value} type="button" className="chip chip-toggle site-chip" aria-pressed={site === s.value} onClick={() => setSite(s.value)}>
              <span>{s.label}</span>
              {s.value === suggestion && <small className="site-hint">sugestão de rodízio</small>}
            </button>
          ))}
        </div>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => onRegister(site)}>
            Registrar
          </button>
          <button type="button" className="btn btn-glass btn-block" onClick={() => onRegister(null)}>
            Sem local
          </button>
        </div>
      </div>
    </Sheet>
  );
}

// --- outro horário ou data ------------------------------------------------------------------------

function WhenSheet({ item, name, onClose, onSubmit }: { item: SupplementItem; name: string; onClose: () => void; onSubmit: (date: string, takenAt: string) => void }) {
  const today = todayISO();
  const now = new Date();
  const [date, setDate] = useState(item.dueDate);
  const [time, setTime] = useState(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  const valid = isValidISO(date) && date <= today && date >= addDays(today, -30) && /^\d{2}:\d{2}$/.test(time);
  return (
    <Sheet open title="Registrar outro horário ou data" onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(date, localToISO(date, time));
        }}
      >
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Outro horário ou data</h2>
          <p className="caption">
            {name} · {doseLine(item)}
          </p>
        </div>
        <label className="field">
          <span className="field-label">Dia</span>
          <input className="input" type="date" value={date} min={addDays(today, -30)} max={today} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Horário</span>
          <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <p className="caption">Dá para registrar até 30 dias atrás.</p>
        <button type="submit" className="btn btn-primary btn-block" disabled={!valid}>
          Registrar
        </button>
      </form>
    </Sheet>
  );
}

// --- mudar a dose desta vez -----------------------------------------------------------------------

function DoseSheet({ item, name, onClose, onSubmit }: { item: SupplementItem; name: string; onClose: () => void; onSubmit: (amount: number) => void }) {
  const [text, setText] = useState(String(item.doseAmount).replace('.', ','));
  const amount = parseDose(text);
  const valid = doseIsValid(amount);
  const unit = doseText(1, item.doseUnit, item.doseUnitLabel).replace(/^1\s*/, '');
  return (
    <Sheet open title="Mudar a dose desta vez" onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onSubmit(amount);
        }}
      >
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Mudar a dose desta vez</h2>
          <p className="caption">{name}</p>
        </div>
        <div className="field">
          <span className="field-label">Dose</span>
          <div className="input-suffix">
            <input className="input num" inputMode="decimal" aria-label="Dose" value={text} onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))} />
            <span aria-hidden>{unit}</span>
          </div>
        </div>
        <p className="caption">Vale só neste registro. A dose do item continua a mesma.</p>
        <button type="submit" className="btn btn-primary btn-block" disabled={!valid}>
          Registrar com esta dose
        </button>
      </form>
    </Sheet>
  );
}

// --- menu "…" -------------------------------------------------------------------------------------

function MenuSheet({ item, name, onClose, onPick }: { item: SupplementItem; name: string; onClose: () => void; onPick: (a: 'skip' | 'when' | 'dose' | 'undo') => void }) {
  const router = useRouter();
  const open = item.status === 'pending' || item.status === 'unlogged';
  return (
    <Sheet open title={name} onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">{name}</h2>
          <p className="caption">
            {doseLine(item)}
            {item.status === 'unlogged' && ` · ${unloggedLabel(item.dueDate)}`}
            {item.status === 'taken' && item.takenAt ? ` · registrado às ${timeText(item.takenAt)}` : ''}
            {item.status === 'skipped' && ' · pulado desta vez'}
          </p>
        </div>
        <div className="list">
          {open && (
            <>
              <button type="button" className="list-row" onClick={() => onPick('skip')}>
                <span className="list-row-main">
                  <span className="list-row-title">Pular desta vez</span>
                </span>
              </button>
              <button type="button" className="list-row" onClick={() => onPick('when')}>
                <span className="list-row-main">
                  <span className="list-row-title">Registrar outro horário ou data</span>
                </span>
              </button>
              <button type="button" className="list-row" onClick={() => onPick('dose')}>
                <span className="list-row-main">
                  <span className="list-row-title">Mudar a dose desta vez</span>
                </span>
              </button>
            </>
          )}
          {!open && (
            <button type="button" className="list-row" onClick={() => onPick('undo')}>
              <span className="list-row-main">
                <span className="list-row-title">Desfazer registro</span>
              </span>
            </button>
          )}
          <button
            type="button"
            className="list-row"
            onClick={() => {
              onClose();
              router.push(`/supplements?plan=${item.planId}`);
            }}
          >
            <span className="list-row-main">
              <span className="list-row-title">Ver histórico</span>
            </span>
          </button>
        </div>
      </div>
    </Sheet>
  );
}

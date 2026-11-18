'use client';

import { useId, useState } from 'react';
import { api, ApiError, errorMessage } from '@/lib/api';
import { addDays, dayMonth, todayISO } from '@/lib/date';
import { tap } from '@/lib/haptics';
import { saveFile } from '@/lib/saveFile';
import {
  ADMINISTRATIONS,
  CALENDAR_NOTICE,
  CATEGORIES,
  DOSE_HISTORY_NOTE,
  DOSE_UNITS,
  doseIsValid,
  doseText,
  localToISO,
  parseDose,
  SITES,
  siteLabel,
  SLOTS,
  SUPPLEMENTS_PRINCIPLES,
  timeText,
  WEEKDAY_CHIPS,
} from '@/lib/supplements';
import { useSupplementActions, useSupplementHistory } from '@/lib/useSupplements';
import type { Administration, DoseUnit, InjectionSite, IntakeLog, ScheduleType, Slot, SupplementCategory, SupplementPlan } from '@/lib/types';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

const SCHEDULES: { value: ScheduleType; label: string }[] = [
  { value: 'DAILY', label: 'Todo dia' },
  { value: 'WEEKDAYS', label: 'Dias da semana' },
  { value: 'EVERY_N_DAYS', label: 'A cada N dias' },
];

/**
 * Cadastro de um item (Sheet; no desktop o CSS a centraliza como diálogo). A dose é um número que a pessoa digita (aceita
 * vírgula) e a unidade é escolhida: nada é validado por faixa, convertido nem sugerido. Editar a dose não muda o histórico.
 */
export function SupplementEditor({ plan, ownNames, onClose }: { plan?: SupplementPlan; ownNames: string[]; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const { refresh } = useSupplementActions();
  const today = todayISO();
  const editing = !!plan;

  const [name, setName] = useState(plan?.name ?? '');
  const [category, setCategory] = useState<SupplementCategory>(plan?.category ?? 'SUPPLEMENT');
  const [administration, setAdministration] = useState<Administration>(plan?.administration ?? 'ORAL');
  const [dose, setDose] = useState(plan ? String(plan.doseAmount).replace('.', ',') : '');
  const [unit, setUnit] = useState<DoseUnit | null>(plan?.doseUnit ?? null);
  const [unitLabel, setUnitLabel] = useState(plan?.doseUnitLabel ?? '');
  const [schedule, setSchedule] = useState<ScheduleType>(plan?.scheduleType ?? 'DAILY');
  const [weekdays, setWeekdays] = useState<number[]>(plan?.weekdays ?? []);
  const [interval, setInterval] = useState(plan?.intervalDays ?? 7);
  const [slots, setSlots] = useState<Slot[]>((plan?.slots ?? []).filter((s) => s !== 'ANY'));
  const [startDate, setStartDate] = useState(plan?.startDate ?? today);
  const [endDate, setEndDate] = useState(plan?.endDate ?? '');
  const [trackSite, setTrackSite] = useState(plan?.trackSite ?? false);
  const [chart, setChart] = useState(plan?.showOnWeightChart ?? false);
  const [notes, setNotes] = useState(plan?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [calendar, setCalendar] = useState(false);

  const amount = parseDose(dose);
  const valid =
    name.trim().length > 0 &&
    doseIsValid(amount) &&
    unit !== null &&
    (unit !== 'OTHER' || unitLabel.trim().length > 0) &&
    (schedule !== 'WEEKDAYS' || weekdays.length > 0) &&
    (endDate === '' || endDate >= startDate);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  async function save() {
    if (!valid || busy || amount === null || unit === null) return;
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: name.trim(),
      category,
      administration,
      doseAmount: amount,
      doseUnit: unit,
      doseUnitLabel: unit === 'OTHER' ? unitLabel.trim() : null,
      scheduleType: schedule,
      slots: slots.length ? slots : ['ANY'],
      startDate,
      endDate: endDate || null,
      notes: notes.trim() || null,
      trackSite: administration === 'INJECTION' && trackSite,
      showOnWeightChart: chart,
    };
    if (schedule === 'WEEKDAYS') body.weekdays = weekdays;
    if (schedule === 'EVERY_N_DAYS') body.intervalDays = interval;
    try {
      if (plan)
        await api(`/supplements/plans/${plan.id}`, {
          method: 'PATCH',
          json: body,
        });
      else await api('/supplements/plans', { method: 'POST', json: body });
      tap();
      await refresh();
      toast.show({
        message: editing ? 'Salvo' : 'Item cadastrado',
        durationMs: 2500,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function archive(next: boolean) {
    if (!plan || busy) return;
    setBusy(true);
    try {
      await api(`/supplements/plans/${plan.id}/${next ? 'archive' : 'unarchive'}`, { method: 'POST' });
      tap();
      await refresh();
      toast.show({
        message: next ? 'Arquivado. O histórico foi mantido.' : 'De volta à lista',
        durationMs: 3000,
      });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!plan || busy) return;
    setBusy(true);
    try {
      await api(`/supplements/plans/${plan.id}`, { method: 'DELETE' });
      tap();
      await refresh();
      toast.show({ message: 'Item e histórico apagados', durationMs: 3000 });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  return (
    <>
      <Sheet open title={editing ? 'Editar item' : 'Novo item'} onClose={onClose}>
        {/* O histórico fica FORA do <form>: as folhas dele são portais e o submit delas borbulharia até o Salvar daqui */}
        <div className="stack-lg">
          <form
            className="stack-lg"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2 className="title">{editing ? 'Editar item' : 'Novo item'}</h2>
            <p className="note">{SUPPLEMENTS_PRINCIPLES}</p>

            <label className="field">
              <span className="field-label">Nome</span>
              <input className="input" value={name} maxLength={60} list={`${id}-names`} autoComplete="off" onChange={(e) => setName(e.target.value)} />
              {/* Sugestões só dos nomes que a própria pessoa já cadastrou (nenhuma lista externa) */}
              <datalist id={`${id}-names`}>
                {ownNames.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </label>

            <div className="field">
              <span className="field-label" id={`${id}-cat`}>
                Categoria
              </span>
              <div className="fat-chips" role="group" aria-labelledby={`${id}-cat`}>
                {CATEGORIES.map((c) => (
                  <button key={c.value} type="button" className="chip chip-toggle" aria-pressed={category === c.value} onClick={() => setCategory(c.value)}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label" id={`${id}-adm`}>
                Como toma
              </span>
              <div className="fat-chips" role="group" aria-labelledby={`${id}-adm`}>
                {ADMINISTRATIONS.map((a) => (
                  <button
                    key={a.value}
                    type="button"
                    className="chip chip-toggle"
                    aria-pressed={administration === a.value}
                    onClick={() => setAdministration(a.value)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label" id={`${id}-dose`}>
                Dose
              </span>
              <input
                className="input num"
                inputMode="decimal"
                placeholder="Ex.: 0,5 ou 8"
                aria-labelledby={`${id}-dose`}
                value={dose}
                onChange={(e) => setDose(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
              />
              <div className="fat-chips" role="group" aria-label="Unidade" style={{ marginTop: 8 }}>
                {DOSE_UNITS.map((u) => (
                  <button key={u.value} type="button" className="chip chip-toggle" aria-pressed={unit === u.value} onClick={() => setUnit(u.value)}>
                    {u.label}
                  </button>
                ))}
              </div>
              {unit === 'OTHER' && (
                <input
                  className="input"
                  style={{ marginTop: 8 }}
                  aria-label="Nome da unidade"
                  placeholder="Ex.: unidades"
                  maxLength={20}
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                />
              )}
              {amount !== null && unit !== null && (unit !== 'OTHER' || unitLabel.trim()) && (
                <p className="caption num">Aparece como: {doseText(amount, unit, unitLabel)}</p>
              )}
              {editing && <p className="caption">{DOSE_HISTORY_NOTE}</p>}
            </div>

            <div className="field">
              <span className="field-label" id={`${id}-freq`}>
                Frequência
              </span>
              <div className="segmented" role="group" aria-labelledby={`${id}-freq`}>
                {SCHEDULES.map((s) => (
                  <button key={s.value} type="button" aria-pressed={schedule === s.value} onClick={() => setSchedule(s.value)}>
                    {s.label}
                  </button>
                ))}
              </div>
              {schedule === 'WEEKDAYS' && (
                <div className="rest-days" role="group" aria-label="Dias da semana" style={{ marginTop: 8 }}>
                  {WEEKDAY_CHIPS.map((d) => (
                    <button
                      key={d.day}
                      type="button"
                      className="chip chip-toggle rest-day-chip"
                      aria-pressed={weekdays.includes(d.day)}
                      aria-label={d.long}
                      onClick={() => setWeekdays(toggle(weekdays, d.day))}
                    >
                      {d.short}
                    </button>
                  ))}
                </div>
              )}
              {schedule === 'EVERY_N_DAYS' && (
                <div className="spread" style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
                  <span className="body-2" id={`${id}-n`}>
                    A cada
                  </span>
                  <div className="stepper" role="group" aria-labelledby={`${id}-n`}>
                    <button
                      type="button"
                      className="stepper-btn"
                      aria-label="Diminuir um dia"
                      disabled={interval <= 2}
                      onClick={() => setInterval(interval - 1)}
                    >
                      −
                    </button>
                    <output className="stepper-value num" aria-live="polite">
                      {interval} dias
                    </output>
                    <button
                      type="button"
                      className="stepper-btn"
                      aria-label="Aumentar um dia"
                      disabled={interval >= 90}
                      onClick={() => setInterval(interval + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              {schedule === 'EVERY_N_DAYS' && <p className="caption">A próxima dose conta a partir do último registro.</p>}
            </div>

            <div className="field">
              <span className="field-label" id={`${id}-slots`}>
                Horários (opcional)
              </span>
              <div className="fat-chips" role="group" aria-labelledby={`${id}-slots`}>
                {SLOTS.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="chip chip-toggle"
                    aria-pressed={slots.includes(s.value)}
                    onClick={() => setSlots(toggle(slots, s.value))}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="caption">Sem nenhum, vale qualquer hora do dia.</p>
            </div>

            <div className="grid-2">
              <label className="field">
                <span className="field-label">Início</span>
                <input className="input" type="date" value={startDate} onChange={(e) => e.target.value && setStartDate(e.target.value)} />
              </label>
              <label className="field">
                <span className="field-label">Fim (opcional)</span>
                <input className="input" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
              </label>
            </div>

            {administration === 'INJECTION' && (
              <label className="switch-row">
                <span>Registrar o local da aplicação</span>
                <input type="checkbox" role="switch" className="switch" checked={trackSite} onChange={(e) => setTrackSite(e.target.checked)} />
              </label>
            )}
            <label className="switch-row">
              <span>Mostrar marcador no gráfico de peso</span>
              <input type="checkbox" role="switch" className="switch" checked={chart} onChange={(e) => setChart(e.target.checked)} />
            </label>

            <label className="field">
              <span className="field-label">Notas (opcional)</span>
              <input className="input" value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} />
            </label>

            {error && (
              <p className="alert" role="alert">
                {error}
              </p>
            )}

            <div className="stack">
              <button type="submit" className="btn btn-primary btn-block" disabled={busy || !valid}>
                {busy ? <span className="spinner" aria-label="Salvando" /> : 'Salvar'}
              </button>
              {plan && !plan.archived && (
                <button type="button" className="btn btn-glass btn-block" onClick={() => setCalendar(true)} disabled={busy}>
                  Adicionar ao calendário
                </button>
              )}
              {plan && (
                <button type="button" className="btn btn-glass btn-block" onClick={() => void archive(!plan.archived)} disabled={busy}>
                  {plan.archived ? 'Desarquivar' : 'Arquivar'}
                </button>
              )}
              {plan && (
                <button type="button" className="btn btn-glass btn-block btn-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  Excluir
                </button>
              )}
            </div>
          </form>
          {plan && <PlanHistory plan={plan} />}
        </div>
      </Sheet>

      {calendar && plan && <CalendarSheet plan={plan} onClose={() => setCalendar(false)} />}

      <Sheet open={confirmDelete} title="Excluir item" onClose={() => setConfirmDelete(false)}>
        <div className="stack-lg">
          <h2 className="title">Excluir item</h2>
          <p className="body-2">Isto apaga o plano e todo o histórico dele. Para manter o histórico, arquive.</p>
          <div className="stack">
            <button type="button" className="btn btn-glass btn-block btn-danger" disabled={busy} onClick={() => void remove()}>
              Excluir tudo
            </button>
            {!plan?.archived && (
              <button
                type="button"
                className="btn btn-primary btn-block"
                disabled={busy}
                onClick={() => {
                  setConfirmDelete(false);
                  void archive(true);
                }}
              >
                Arquivar em vez de excluir
              </button>
            )}
            <button type="button" className="btn btn-plain btn-block" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        </div>
      </Sheet>
    </>
  );
}

// --- histórico do plano ---------------------------------------------------------------------------

const HISTORY_DAYS = 120;

function PlanHistory({ plan }: { plan: SupplementPlan }) {
  const to = todayISO();
  const { data } = useSupplementHistory(plan.id, addDays(to, -HISTORY_DAYS), to);
  const [selected, setSelected] = useState<IntakeLog | null>(null);
  const logs = data?.logs ?? [];
  return (
    <section className="stack-sm" aria-label="Histórico">
      <h3 className="headline">Histórico</h3>
      {!data && <div className="skeleton" style={{ height: 44 }} />}
      {data && logs.length === 0 && <p className="caption">Nenhum registro nos últimos {HISTORY_DAYS} dias.</p>}
      {logs.length > 0 && (
        <div className="list">
          {logs.map((l) => (
            <button key={l.id} type="button" className="list-row" onClick={() => setSelected(l)}>
              <span className="list-row-main">
                <span className="list-row-title num" style={{ display: 'block' }}>
                  {dayMonth(l.date)}
                  {l.status === 'TAKEN' && l.takenAt ? ` · ${timeText(l.takenAt)}` : ''}
                  {l.status === 'SKIPPED' ? ' · pulado' : ''}
                </span>
                <span className="list-row-sub">
                  {doseText(l.doseAmount, l.doseUnit, l.doseUnitLabel)}
                  {l.site ? ` · ${siteLabel(l.site)}` : ''}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {selected && <LogSheet key={selected.id} log={selected} plan={plan} onClose={() => setSelected(null)} />}
    </section>
  );
}

/** Editar ou excluir um registro do histórico (dose, horário, local e nota). */
function LogSheet({ log, plan, onClose }: { log: IntakeLog; plan: SupplementPlan; onClose: () => void }) {
  const toast = useToast();
  const { refresh, removeLog } = useSupplementActions();
  const taken = log.status === 'TAKEN';
  const when = log.takenAt ? new Date(log.takenAt) : null;
  const pad = (n: number) => String(n).padStart(2, '0');
  const [dose, setDose] = useState(String(log.doseAmount).replace('.', ','));
  const [day, setDay] = useState(when ? `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` : log.date);
  const [time, setTime] = useState(timeText(log.takenAt) || '08:00');
  const [site, setSite] = useState<InjectionSite | null>(log.site);
  const [note, setNote] = useState(log.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = parseDose(dose);

  async function save() {
    if (!doseIsValid(amount) || busy) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        doseAmount: amount,
        note: note.trim() || null,
      };
      if (taken) body.takenAt = localToISO(day, time);
      if (plan.administration === 'INJECTION') body.site = site;
      await api(`/supplements/log/${log.id}`, { method: 'PATCH', json: body });
      tap();
      await refresh();
      toast.show({ message: 'Registro atualizado', durationMs: 2500 });
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Registro" onClose={onClose}>
      <form
        className="stack-lg"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="stack" style={{ gap: 2 }}>
          <h2 className="title">Registro de {dayMonth(log.date)}</h2>
          <p className="caption">{taken ? 'Registrado' : 'Pulado'}</p>
        </div>
        <div className="field">
          <span className="field-label">Dose deste registro</span>
          <div className="input-suffix">
            <input
              className="input num"
              inputMode="decimal"
              aria-label="Dose"
              value={dose}
              onChange={(e) => setDose(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
            />
            <span aria-hidden>{doseText(1, log.doseUnit, log.doseUnitLabel).replace(/^1\s*/, '')}</span>
          </div>
        </div>
        {taken && (
          <div className="grid-2">
            <label className="field">
              <span className="field-label">Dia</span>
              <input className="input" type="date" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Horário</span>
              <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </label>
          </div>
        )}
        {plan.administration === 'INJECTION' && (
          <div className="field">
            <span className="field-label">Local da aplicação</span>
            <div className="site-grid" role="group" aria-label="Local">
              {SITES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="chip chip-toggle site-chip"
                  aria-pressed={site === s.value}
                  onClick={() => setSite(site === s.value ? null : s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="field">
          <span className="field-label">Nota (opcional)</span>
          <input className="input" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} />
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="stack">
          <button type="submit" className="btn btn-primary btn-block" disabled={busy || !doseIsValid(amount)}>
            Salvar
          </button>
          <button
            type="button"
            className="btn btn-glass btn-block btn-danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await removeLog(log.id)) onClose();
              else setBusy(false);
            }}
          >
            Excluir registro
          </button>
        </div>
      </form>
    </Sheet>
  );
}

// --- calendário (.ics) ----------------------------------------------------------------------------

/**
 * Gera o arquivo de calendário na hora, só para a pessoa (autenticado, sem link público, token nem assinatura).
 * O título é genérico por padrão; o nome e a dose só entram por escolha explícita.
 */
function CalendarSheet({ plan, onClose }: { plan: SupplementPlan; onClose: () => void }) {
  const toast = useToast();
  const [time, setTime] = useState('08:00');
  const [generic, setGeneric] = useState(true);
  const [withDose, setWithDose] = useState(false);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (busy || !/^\d{2}:\d{2}$/.test(time)) return;
    setBusy(true);
    try {
      const query = new URLSearchParams({
        time,
        title: generic ? 'generic' : 'name',
        dose: withDose ? '1' : '0',
      });
      const res = await fetch(`/api/supplements/plans/${plan.id}/calendar.ics?${query}`, { credentials: 'same-origin' });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new ApiError(res.status, typeof data?.message === 'string' ? data.message : 'Não foi possível gerar o arquivo. Tente de novo.');
      }
      await saveFile(await res.blob(), 'bocado-lembrete.ics', 'text/calendar');
      toast.show({ message: 'Arquivo de calendário pronto', durationMs: 3000 });
      onClose();
    } catch (err) {
      // Fechar a folha de compartilhar do iOS não é erro
      if (!(err instanceof DOMException && err.name === 'AbortError')) toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open title="Adicionar ao calendário" onClose={onClose}>
      <div className="stack-lg">
        <h2 className="title">Adicionar ao calendário</h2>
        <label className="field">
          <span className="field-label">Horário do lembrete</span>
          <input className="input" type="time" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
        </label>
        <label className="switch-row">
          <span>Título genérico (“Lembrete do Bocado”)</span>
          <input type="checkbox" role="switch" className="switch" checked={generic} onChange={(e) => setGeneric(e.target.checked)} />
        </label>
        {!generic && <p className="caption">O nome do item vai aparecer no seu calendário.</p>}
        <label className="switch-row">
          <span>Incluir dose no título</span>
          <input type="checkbox" role="switch" className="switch" checked={withDose} onChange={(e) => setWithDose(e.target.checked)} />
        </label>
        {withDose && <p className="caption">A dose vai aparecer no seu calendário.</p>}
        <p className="caption">{CALENDAR_NOTICE}</p>
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void download()}>
          {busy ? <span className="spinner" aria-label="Gerando" /> : 'Adicionar ao calendário'}
        </button>
      </div>
    </Sheet>
  );
}

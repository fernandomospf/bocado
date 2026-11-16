'use client';

import { notFound } from 'next/navigation';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ApiError, api, errorMessage } from '@/lib/api';
import { AdminAiTab } from './AdminAiTab';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

type WaitStatus = 'PENDING' | 'INVITED' | 'JOINED';
interface Stats {
  users: number;
  seatsLimit?: number;
  waitlistPending: number;
  invitesActive: number;
  invitesUsed: number;
}
interface WaitItem {
  id: string;
  email: string;
  name: string | null;
  status: WaitStatus;
  createdAt: string;
  invite: { code: string; expiresAt: string | null; status: string } | null;
}
interface WaitPage {
  page: number;
  pageSize: number;
  total: number;
  items: WaitItem[];
}
interface InviteRow {
  id: string;
  code: string;
  label: string;
  maxUses: number;
  uses: number;
  expiresAt: string | null;
  status: 'active' | 'expired' | 'revoked' | 'exhausted';
  link: string;
}
interface InvitePayload {
  code: string;
  link: string;
  message: string;
  expiresAt: string | null;
}

const STATUS_LABEL: Record<WaitStatus, string> = { PENDING: 'Aguardando', INVITED: 'Convidado', JOINED: 'Entrou' };
const INVITE_STATUS: Record<InviteRow['status'], string> = { active: 'Ativo', expired: 'Expirado', revoked: 'Revogado', exhausted: 'Esgotado' };
const FILTERS: { value: WaitStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Aguardando' },
  { value: 'INVITED', label: 'Convidados' },
  { value: 'JOINED', label: 'Entraram' },
];

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : 'sem validade');

/** Painel do beta (/admin). Quem não é admin vê a página 404 do app. */
export function AdminView() {
  const { data: me, error } = useSWR<{ admin: true }>('/admin/me', { shouldRetryOnError: false, revalidateOnFocus: false });
  const [tab, setTab] = useState<'waitlist' | 'invites' | 'ai'>('waitlist');

  if (error instanceof ApiError && (error.status === 403 || error.status === 404)) notFound();
  if (error && !(error instanceof ApiError && error.status === 401)) {
    return (
      <main className="screen">
        <p className="alert" role="alert">
          {error.message}
        </p>
      </main>
    );
  }
  if (!me) {
    return (
      <div className="splash" aria-busy="true">
        <span className="spinner" aria-label="Carregando" />
      </div>
    );
  }

  return (
    <main className="screen admin-screen">
      <header className="header">
        <h1 className="large-title">Admin</h1>
      </header>

      <StatsCards />

      <div className="segmented" role="group" aria-label="Seções">
        <button type="button" aria-pressed={tab === 'waitlist'} onClick={() => setTab('waitlist')}>
          Lista de espera
        </button>
        <button type="button" aria-pressed={tab === 'invites'} onClick={() => setTab('invites')}>
          Convites
        </button>
        <button type="button" aria-pressed={tab === 'ai'} onClick={() => setTab('ai')}>
          Uso de IA
        </button>
      </div>

      {tab === 'waitlist' ? <WaitlistTab /> : tab === 'invites' ? <InvitesTab /> : <AdminAiTab />}
    </main>
  );
}

function StatsCards() {
  const { data } = useSWR<Stats>('/admin/stats', { revalidateOnFocus: true });
  const cards = [
    { label: 'Usuários', value: data ? String(data.users) : '–', hint: data?.seatsLimit ? `de ${data.seatsLimit} vagas` : undefined },
    { label: 'Na lista de espera', value: data ? String(data.waitlistPending) : '–' },
    { label: 'Convites ativos', value: data ? String(data.invitesActive) : '–' },
    { label: 'Convites usados', value: data ? String(data.invitesUsed) : '–' },
  ];
  return (
    <section className="admin-stats" aria-label="Resumo">
      {cards.map((c) => (
        <div key={c.label} className="card glass stat">
          <span className="caption">{c.label}</span>
          <strong className="num" style={{ fontSize: 28 }}>
            {c.value}
          </strong>
          {c.hint && <span className="caption">{c.hint}</span>}
        </div>
      ))}
    </section>
  );
}

function useRefresh() {
  const { mutate } = useSWRConfig();
  return () => mutate((key) => typeof key === 'string' && key.startsWith('/admin/'));
}

function WaitlistTab() {
  const toast = useToast();
  const refresh = useRefresh();
  const [status, setStatus] = useState<WaitStatus | ''>('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [sheet, setSheet] = useState<{ email: string; payload: InvitePayload } | null>(null);
  const { data, error } = useSWR<WaitPage>(`/admin/waitlist?${status ? `status=${status}&` : ''}page=${page}`);

  async function invite(item: WaitItem) {
    setBusy(item.id);
    try {
      const payload = await api<InvitePayload>(`/admin/waitlist/${item.id}/invite`, { method: 'POST' });
      setSheet({ email: item.email, payload });
      void refresh();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: WaitItem) {
    if (confirmRemove !== item.id) return setConfirmRemove(item.id);
    setBusy(item.id);
    try {
      await api(`/admin/waitlist/${item.id}`, { method: 'DELETE' });
      setConfirmRemove(null);
      toast.show({ message: 'Removido da lista', durationMs: 2500 });
      void refresh();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const items = data?.items ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const actions = (i: WaitItem) => (
    <span className="admin-actions">
      {i.status !== 'JOINED' && (
        <button type="button" className="btn btn-glass btn-sm" disabled={busy === i.id} onClick={() => void invite(i)}>
          {i.status === 'INVITED' ? 'Reenviar texto' : 'Gerar convite'}
        </button>
      )}
      <button type="button" className="btn btn-plain btn-sm btn-danger" disabled={busy === i.id} onClick={() => void remove(i)}>
        {confirmRemove === i.id ? 'Confirmar remoção' : 'Remover'}
      </button>
    </span>
  );

  return (
    <section className="stack" aria-label="Lista de espera">
      <div className="segmented" role="group" aria-label="Filtrar por status">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={status === f.value}
            onClick={() => {
              setStatus(f.value);
              setPage(1);
              setConfirmRemove(null);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}

      {data && items.length === 0 && <p className="caption">Ninguém por aqui.</p>}

      {items.length > 0 && (
        <>
          <table className="adm-table card glass">
            <thead>
              <tr>
                <th scope="col">E-mail</th>
                <th scope="col">Nome</th>
                <th scope="col">Data</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{i.name ?? '–'}</td>
                  <td>{fmtDate(i.createdAt)}</td>
                  <td>{STATUS_LABEL[i.status]}</td>
                  <td>{actions(i)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <ul className="adm-cards">
            {items.map((i) => (
              <li key={i.id} className="card glass stack-sm">
                <div className="spread">
                  <strong style={{ wordBreak: 'break-all' }}>{i.email}</strong>
                  <span className="badge">{STATUS_LABEL[i.status]}</span>
                </div>
                <p className="caption">
                  {i.name ? `${i.name} · ` : ''}
                  {fmtDate(i.createdAt)}
                </p>
                {actions(i)}
              </li>
            ))}
          </ul>
        </>
      )}

      {pages > 1 && (
        <div className="spread">
          <button type="button" className="btn btn-glass btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <span className="caption num">
            Página {page} de {pages}
          </span>
          <button type="button" className="btn btn-glass btn-sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}

      {sheet && <InviteSheet email={sheet.email} payload={sheet.payload} onClose={() => setSheet(null)} />}
    </section>
  );
}

function InviteSheet({ email, payload, onClose }: { email: string; payload: InvitePayload; onClose: () => void }) {
  const toast = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(payload.message);
      toast.show({ message: 'Mensagem copiada', durationMs: 2000 });
    } catch {
      toast.show({ message: 'Não foi possível copiar. Selecione o texto e copie.', tone: 'error' });
    }
  }
  return (
    <Sheet open title="Convite" onClose={onClose}>
      <div className="stack-lg">
        <div className="stack" style={{ gap: 4 }}>
          <h2 className="title">Convite para {email}</h2>
          <p className="caption">Vale até {fmtDate(payload.expiresAt)}. Uso único.</p>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <span className="field-label">Código</span>
          <strong className="num" style={{ fontSize: 24, letterSpacing: 3 }}>
            {payload.code}
          </strong>
          <span className="caption" style={{ wordBreak: 'break-all' }}>
            {payload.link}
          </span>
        </div>
        <label className="field">
          <span className="field-label">Mensagem pronta</span>
          <textarea className="textarea" readOnly rows={4} value={payload.message} onFocus={(e) => e.currentTarget.select()} />
        </label>
        <div className="stack">
          <button type="button" className="btn btn-primary btn-block" onClick={() => void copy()}>
            Copiar mensagem
          </button>
          <a
            className="btn btn-glass btn-block"
            href={`https://wa.me/?text=${encodeURIComponent(payload.message)}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir no WhatsApp
          </a>
        </div>
      </div>
    </Sheet>
  );
}

function InvitesTab() {
  const toast = useToast();
  const refresh = useRefresh();
  const { data, error } = useSWR<InviteRow[]>('/admin/invites');
  const [creating, setCreating] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [created, setCreated] = useState<InvitePayload | null>(null);
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('1');
  const [days, setDays] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function create() {
    setFormError(null);
    const uses = Number(maxUses);
    if (!label.trim()) return setFormError('Informe para quem é o convite.');
    if (!Number.isInteger(uses) || uses < 1 || uses > 50) return setFormError('Os usos precisam ser de 1 a 50.');
    const d = days.trim() ? Number(days) : undefined;
    if (d !== undefined && (!Number.isInteger(d) || d < 1 || d > 365)) return setFormError('A validade precisa ser de 1 a 365 dias.');
    setBusy(true);
    try {
      const out = await api<InvitePayload>('/admin/invites', {
        method: 'POST',
        json: { label: label.trim(), maxUses: uses, ...(d ? { expiresInDays: d } : {}) },
      });
      setCreated(out);
      setCreating(false);
      setLabel('');
      setMaxUses('1');
      setDays('');
      void refresh();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: InviteRow) {
    if (confirmRevoke !== row.id) return setConfirmRevoke(row.id);
    try {
      await api(`/admin/invites/${row.id}/revoke`, { method: 'POST' });
      setConfirmRevoke(null);
      toast.show({ message: 'Convite revogado', durationMs: 2500 });
      void refresh();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  return (
    <section className="stack" aria-label="Convites">
      <button type="button" className="btn btn-primary btn-block" onClick={() => setCreating(true)}>
        Criar convite
      </button>

      {error && (
        <p className="alert" role="alert">
          {error.message}
        </p>
      )}
      {data && data.length === 0 && <p className="caption">Nenhum convite ainda.</p>}

      {data && data.length > 0 && (
        <>
          <table className="adm-table card glass">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Rótulo</th>
                <th scope="col">Usos</th>
                <th scope="col">Validade</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((i) => (
                <tr key={i.id}>
                  <td className="num">{i.code}</td>
                  <td>{i.label}</td>
                  <td className="num">
                    {i.uses}/{i.maxUses}
                  </td>
                  <td>{fmtDate(i.expiresAt)}</td>
                  <td>{INVITE_STATUS[i.status]}</td>
                  <td>
                    {i.status === 'active' && (
                      <button type="button" className="btn btn-plain btn-sm btn-danger" onClick={() => void revoke(i)}>
                        {confirmRevoke === i.id ? 'Confirmar' : 'Revogar'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="adm-cards">
            {data.map((i) => (
              <li key={i.id} className="card glass stack-sm">
                <div className="spread">
                  <strong className="num" style={{ letterSpacing: 2 }}>
                    {i.code}
                  </strong>
                  <span className="badge">{INVITE_STATUS[i.status]}</span>
                </div>
                <p className="caption">
                  {i.label} · {i.uses}/{i.maxUses} usos · {fmtDate(i.expiresAt)}
                </p>
                {i.status === 'active' && (
                  <button type="button" className="btn btn-plain btn-sm btn-danger" onClick={() => void revoke(i)} style={{ alignSelf: 'flex-start' }}>
                    {confirmRevoke === i.id ? 'Confirmar revogação' : 'Revogar'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {creating && (
        <Sheet open title="Criar convite" onClose={() => setCreating(false)}>
          <form
            className="stack-lg"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <h2 className="title">Novo convite</h2>
            {formError && (
              <p className="alert" role="alert">
                {formError}
              </p>
            )}
            <label className="field">
              <span className="field-label">Para quem é</span>
              <input className="input" maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Grupo do trabalho" />
            </label>
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Usos (1 a 50)</span>
                <input className="input num" inputMode="numeric" value={maxUses} onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))} />
              </label>
              <label className="field">
                <span className="field-label">Validade (dias)</span>
                <input className="input num" inputMode="numeric" placeholder="Sem validade" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} />
              </label>
            </div>
            <button className="btn btn-primary btn-block" disabled={busy} type="submit">
              {busy ? <span className="spinner" aria-label="Criando" /> : 'Criar convite'}
            </button>
          </form>
        </Sheet>
      )}

      {created && <InviteSheet email={label || 'convite manual'} payload={created} onClose={() => setCreated(null)} />}
    </section>
  );
}

'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import { useToast } from './Toast';

export interface ReportShareItem {
  id: string;
  token: string;
  from: string;
  to: string;
  expiresAt: string;
  maxDevices: number;
  devicesUsed: number;
  lastOpenedAt: string | null;
  openings: { deviceNumber: number; at: string }[];
  status: 'active' | 'expired' | 'revoked' | 'blocked';
}
interface Created extends ReportShareItem {
  code: string;
}

const br = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(d)} às ${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(d)}`;
};
const linkOf = (token: string) => `${window.location.origin}/r/${token}`;

const EXPIRIES = [
  { days: 1, label: '1 dia' },
  { days: 7, label: '7 dias' },
  { days: 30, label: '30 dias' },
] as const;

/** Copiar e compartilhar um texto (o link e o código ficam em campos SEPARADOS, cada um com o seu botão). */
function CopyShare({ label, value, title }: { label: string; value: string; title: string }) {
  const toast = useToast();
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <div className="stack-sm">
      <span className="field-label">{label}</span>
      <code className="share-secret">{value}</code>
      <div className="grid-2">
        <button
          type="button"
          className="btn btn-glass"
          onClick={() =>
            void navigator.clipboard.writeText(value).then(
              () => toast.show({ message: `${label} copiado` }),
              () => toast.show({ message: 'Não foi possível copiar. Selecione e copie à mão.', tone: 'error' }),
            )
          }
        >
          Copiar
        </button>
        {canShare && (
          <button type="button" className="btn btn-glass" onClick={() => void navigator.share({ title, text: value }).catch(() => undefined)}>
            Compartilhar
          </button>
        )}
      </div>
    </div>
  );
}

/** Criação do link: aparelhos que podem abrir, validade; o código aparece UMA vez, separado do link. */
export function ShareCreator({ from, to }: { from: string; to: string }) {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const [devices, setDevices] = useState<1 | 2>(1);
  const [days, setDays] = useState<number>(7);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);

  async function create() {
    setBusy(true);
    try {
      setCreated(await api<Created>('/reports/shares', { method: 'POST', json: { from, to, expiresInDays: days, maxDevices: devices } }));
      void mutate('/reports/shares');
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const url = linkOf(created.token);
    return (
      <div className="stack-lg" aria-live="polite">
        <h3 className="headline">Link criado</h3>
        <CopyShare label="Link" value={url} title="Relatório do Bocado" />
        <CopyShare label="Código" value={created.code} title="Código de acesso" />
        <p className="note">
          Envie o link e o código em mensagens separadas, de preferência por canais diferentes (ex.: o link pelo WhatsApp e o código por SMS ou
          ligação). O código aparece só agora: se perder, crie outro link.
        </p>
        <a className="btn btn-primary btn-block" href={`https://wa.me/?text=${encodeURIComponent(`Relatório de alimentação (Bocado): ${url}`)}`} target="_blank" rel="noopener noreferrer">
          Enviar o link pelo WhatsApp
        </a>
        <p className="caption">
          Vale até {br(created.expiresAt)} e abre em {created.maxDevices} {created.maxDevices === 1 ? 'aparelho' : 'aparelhos'}.
        </p>
      </div>
    );
  }

  return (
    <div className="stack-lg">
      <div>
        <h3 className="headline">Compartilhar com o nutricionista</h3>
        <p className="caption">O link só abre com um código de acesso, gerado por nós e mostrado uma vez. Você pode cancelar quando quiser.</p>
      </div>
      <fieldset className="stack-sm import-conflict">
        <legend className="field-label">Aparelhos que podem abrir</legend>
        <label className="check-row">
          <input type="radio" name="devices" checked={devices === 1} onChange={() => setDevices(1)} />
          <span>
            1 aparelho <span className="caption">(o mais seguro)</span>
          </span>
        </label>
        <label className="check-row">
          <input type="radio" name="devices" checked={devices === 2} onChange={() => setDevices(2)} />
          <span>
            2 aparelhos <span className="caption">(por exemplo, celular e computador)</span>
          </span>
        </label>
      </fieldset>
      <div className="stack-sm" role="group" aria-label="Validade do link">
        <span className="field-label">O link vale por</span>
        <div className="segmented">
          {EXPIRIES.map((e) => (
            <button key={e.days} type="button" aria-pressed={days === e.days} onClick={() => setDays(e.days)}>
              {e.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" className="btn btn-glass btn-block" disabled={busy} onClick={create}>
        {busy ? <span className="spinner" aria-label="Criando" /> : 'Criar link com código'}
      </button>
    </div>
  );
}

const STATUS: Record<ReportShareItem['status'], string> = {
  active: 'Ativo',
  expired: 'Expirou',
  revoked: 'Cancelado',
  blocked: 'Cancelado por tentativas erradas',
};

/** Perfil: links criados, aparelhos usados, última abertura, revogar e "Liberar aparelhos" (com confirmação). */
export function ReportSharesList() {
  const toast = useToast();
  const { mutate } = useSWRConfig();
  const { data } = useSWR<ReportShareItem[]>('/reports/shares', { revalidateOnFocus: false });
  const [confirm, setConfirm] = useState<{ id: string; kind: 'release' | 'revoke' } | null>(null);
  if (!data || data.length === 0) return null;

  async function run(id: string, kind: 'release' | 'revoke') {
    try {
      if (kind === 'revoke') await api(`/reports/shares/${id}`, { method: 'DELETE' });
      else await api(`/reports/shares/${id}/release`, { method: 'POST' });
      setConfirm(null);
      await mutate('/reports/shares');
      void mutate('/reports/shares/notices');
      toast.show({ message: kind === 'revoke' ? 'Link cancelado' : 'Aparelhos liberados: o mesmo código serve para um novo aparelho' });
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  return (
    <div className="stack-sm" aria-label="Links do relatório">
      <h3 className="caption">Links do relatório</h3>
      <ul className="list">
        {data.map((s) => (
          <li key={s.id} className="list-row share-row">
            <span className="list-row-main">
              <span className="list-row-title num">
                {br(s.from)} a {br(s.to)} · {STATUS[s.status]}
              </span>
              <span className="list-row-sub num">
                Aparelhos: {s.devicesUsed} de {s.maxDevices}
                {s.lastOpenedAt ? ` · última abertura ${stamp(s.lastOpenedAt)}` : ' · ainda não aberto'}
                {s.status === 'active' ? ` · vale até ${br(s.expiresAt)}` : ''}
              </span>
              {confirm?.id === s.id ? (
                <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <span className="caption">{confirm.kind === 'release' ? 'Liberar os aparelhos deste link?' : 'Cancelar este link agora?'}</span>
                  <button type="button" className="btn btn-glass btn-sm" onClick={() => void run(s.id, confirm.kind)}>
                    {confirm.kind === 'release' ? 'Liberar' : 'Cancelar link'}
                  </button>
                  <button type="button" className="btn btn-plain btn-sm" onClick={() => setConfirm(null)}>
                    Voltar
                  </button>
                </span>
              ) : (
                s.status === 'active' && (
                  <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                    {s.devicesUsed > 0 && (
                      <button type="button" className="btn btn-plain btn-sm" onClick={() => setConfirm({ id: s.id, kind: 'release' })}>
                        Liberar aparelhos
                      </button>
                    )}
                    <button type="button" className="btn btn-plain btn-sm" onClick={() => setConfirm({ id: s.id, kind: 'revoke' })}>
                      Revogar
                    </button>
                  </span>
                )
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Notices {
  opened: { linkId: string; at: string; deviceNumber: number; maxDevices: number; revoked: boolean }[];
  blocked: { linkId: string }[];
}

/** Home (uma vez): "Seu relatório foi aberto em 20/11 às 14:05 (aparelho 1 de 1)" com "Revogar agora"; e link cancelado por tentativas. */
export function ReportShareNotice() {
  const { mutate } = useSWRConfig();
  const { data } = useSWR<Notices>('/reports/shares/notices', { revalidateOnFocus: true });
  const toast = useToast();
  if (!data || (data.opened.length === 0 && data.blocked.length === 0)) return null;

  async function seen() {
    await api('/reports/shares/notices/seen', { method: 'POST' }).catch(() => undefined);
    await mutate('/reports/shares/notices');
  }
  async function revoke(linkId: string) {
    try {
      await api(`/reports/shares/${linkId}`, { method: 'DELETE' });
      toast.show({ message: 'Link cancelado' });
      await mutate('/reports/shares');
      await seen();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  return (
    <section className="card glass stack-sm" aria-label="Avisos do relatório compartilhado" role="status">
      {data.opened.map((o) => (
        <div key={`${o.linkId}-${o.at}`} className="stack-sm">
          <p className="body-2 num">
            Seu relatório foi aberto em {stamp(o.at)} (aparelho {o.deviceNumber} de {o.maxDevices}).
          </p>
          {!o.revoked && (
            <button type="button" className="btn btn-glass btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => void revoke(o.linkId)}>
              Revogar agora
            </button>
          )}
        </div>
      ))}
      {data.blocked.length > 0 && <p className="body-2">Um link do seu relatório foi cancelado depois de várias tentativas erradas de código.</p>}
      <button type="button" className="btn btn-plain btn-sm" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => void seen()}>
        Ok, entendi
      </button>
    </section>
  );
}

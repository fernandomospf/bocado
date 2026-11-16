'use client';

import Link from 'next/link';
import Script from 'next/script';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, errorMessage } from '@/lib/api';

const SITEKEY = process.env.NEXT_PUBLIC_TURNSTILE_SITEKEY ?? '';

type Status = 'idle' | 'sending' | 'done';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (t: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
      reset: (id?: string) => void;
    };
  }
}

/** Formulário da lista de espera. A mensagem de sucesso é a mesma para e-mail novo ou repetido. */
export function WaitlistForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot: só robô preenche
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);

  function renderWidget() {
    if (!SITEKEY || !widget.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(widget.current, {
      sitekey: SITEKEY,
      callback: setToken,
      'expired-callback': () => setToken(''),
      'error-callback': () => setToken(''),
    });
  }
  useEffect(renderWidget, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Informe um e-mail válido.');
    if (!consent) return setError('Para entrar na lista, marque a caixa de consentimento.');
    if (SITEKEY && !token) return setError('Aguarde a verificação de segurança e tente de novo.');

    setStatus('sending');
    try {
      await api('/waitlist', {
        method: 'POST',
        json: { email: email.trim(), ...(name.trim() ? { name: name.trim() } : {}), consent: true, website, ...(token ? { turnstileToken: token } : {}) },
      });
      setStatus('done');
    } catch (err) {
      setStatus('idle');
      if (SITEKEY) window.turnstile?.reset(widgetId.current);
      setToken('');
      // Falha de rede, limite de tentativas ou validação: mensagem clara, sem alarme
      setError(err instanceof ApiError && err.status === 0 ? err.message : errorMessage(err));
    }
  }

  if (status === 'done') {
    return (
      <div className="lp-success card glass" role="status">
        <p className="headline">Pronto! Quando abrir uma vaga, avisamos por e-mail.</p>
      </div>
    );
  }

  return (
    <form className="card glass stack lp-form" onSubmit={onSubmit} noValidate>
      {SITEKEY && (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="lazyOnload" onReady={renderWidget} />
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <label className="field">
        <span className="field-label">Nome (opcional)</span>
        <input className="input" autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">E-mail</span>
        <input
          className="input"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>

      {/* Honeypot: fora da tela, fora da ordem de tabulação, sem preenchimento automático */}
      <div className="lp-hp" aria-hidden="true">
        <label>
          Não preencha este campo
          <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <label className="lp-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          Concordo em receber um convite por e-mail e com a{' '}
          <Link href="/privacidade" className="text-link">
            Política de Privacidade
          </Link>
        </span>
      </label>

      {SITEKEY && <div ref={widget} />}

      <button className="btn btn-primary btn-block" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? <span className="spinner" aria-label="Enviando" /> : 'Entrar na lista de espera'}
      </button>
    </form>
  );
}

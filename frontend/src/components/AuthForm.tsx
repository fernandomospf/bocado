'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { api, errorMessage } from '@/lib/api';
import type { Me } from '@/lib/types';
import { GoogleIcon } from './Icons';
import { Logo } from './Logo';

type Mode = 'login' | 'register';

const OAUTH_ERRORS: Record<string, string> = {
  google: 'Não foi possível entrar com o Google. Tente de novo.',
};

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { mutate } = useSWRConfig();
  const { data: providers } = useSWR<{ google: boolean }>('/auth/providers');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(OAUTH_ERRORS[params.get('error') ?? ''] ?? null);

  const isRegister = mode === 'register';

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const me = await api<Me>(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        json: isRegister ? { name, email, password } : { email, password },
      });
      await mutate('/auth/me', me, { revalidate: false });
      router.replace(me.onboarded ? '/' : '/onboarding');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <main className="screen screen-plain screen-center">
      <div className="brand">
        <Logo size={72} />
        <div className="stack" style={{ gap: 6 }}>
          <h1 className="large-title">{isRegister ? 'Crie sua conta' : 'Bocado'}</h1>
          <p className="body-2">
            {isRegister ? 'Leva menos de um minuto.' : 'Cada bocado conta. Fotografe e pronto.'}
          </p>
        </div>
      </div>

      <form className="card glass stack" onSubmit={onSubmit} noValidate>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {isRegister && (
          <label className="field">
            <span className="field-label">Nome</span>
            <input
              className="input"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
            />
          </label>
        )}

        <label className="field">
          <span className="field-label">E-mail</span>
          <input
            className="input"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span className="field-label">Senha</span>
          <input
            className="input"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isRegister ? 8 : 1}
            placeholder={isRegister ? 'Mínimo de 8 caracteres' : undefined}
          />
        </label>

        <button className="btn btn-primary btn-block" disabled={busy} type="submit">
          {busy ? <span className="spinner" aria-label="Carregando" /> : isRegister ? 'Criar conta' : 'Entrar'}
        </button>

        {providers?.google && (
          <>
            <div className="divider">ou</div>
            {/* Navegação completa: o fluxo OAuth precisa sair do app e voltar */}
            <a className="btn btn-glass btn-block" href="/api/auth/google">
              <GoogleIcon />
              Continuar com Google
            </a>
          </>
        )}
      </form>

      <p className="caption" style={{ textAlign: 'center' }}>
        Ao continuar, você concorda com os{' '}
        <Link href="/termos" className="text-link">
          Termos de Uso
        </Link>{' '}
        e a{' '}
        <Link href="/privacidade" className="text-link">
          Política de Privacidade
        </Link>
        .
      </p>

      <p className="body-2" style={{ textAlign: 'center' }}>
        {isRegister ? 'Já tem conta? ' : 'Ainda não tem conta? '}
        <Link href={isRegister ? '/login' : '/register'} className="btn-plain" style={{ padding: 0 }}>
          {isRegister ? 'Entrar' : 'Criar conta'}
        </Link>
      </p>
    </main>
  );
}

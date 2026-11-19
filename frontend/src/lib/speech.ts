'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Registro por voz. O reconhecimento é do navegador/sistema (Web Speech API): nada de áudio é gravado nem enviado ao
 * Bocado, só o TEXTO que a pessoa revisa. Sem suporte, `supported` é false e quem usa o hook não mostra o botão.
 */

export type SpeechState = 'idle' | 'listening' | 'error';
export type SpeechErrorKind = 'denied' | 'unsupported' | 'no-speech' | 'other';

export const SPEECH_LANG = 'pt-BR';
/** Silêncio depois da última fala reconhecida que encerra a escuta. */
export const SILENCE_MS = 2000;

export const SPEECH_ERROR_TEXT: Record<SpeechErrorKind, string> = {
  denied: 'Sem acesso ao microfone. Libere a permissão nas configurações do navegador.',
  unsupported: 'Este navegador não faz reconhecimento de voz.',
  'no-speech': 'Não ouvi nada. Toque no microfone e tente de novo.',
  other: 'Não foi possível ouvir agora. Tente de novo.',
};

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
export interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort?(): void;
}
export type RecognitionCtor = new () => RecognitionLike;

/** O construtor do reconhecimento de voz, ou null (SSR ou navegador sem suporte). */
export function getRecognitionCtor(win: unknown = typeof window === 'undefined' ? undefined : window): RecognitionCtor | null {
  const w = win as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor } | undefined;
  return w?.SpeechRecognition ?? w?.webkitSpeechRecognition ?? null;
}

export function errorKindOf(code: string | undefined): SpeechErrorKind {
  if (code === 'not-allowed' || code === 'service-not-allowed') return 'denied';
  if (code === 'no-speech') return 'no-speech';
  if (code === 'language-not-supported') return 'unsupported';
  return 'other';
}

export interface SessionHandlers {
  onStart?: () => void;
  /** Texto reconhecido até agora (final + provisório). */
  onPartial?: (text: string) => void;
  /** Uma vez, ao terminar, com o texto final (nunca vazio). */
  onResult: (text: string) => void;
  onError: (kind: SpeechErrorKind) => void;
  /** Sempre, ao terminar (com ou sem texto, com ou sem erro). */
  onEnd?: () => void;
}

export interface SessionTimers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (id: unknown) => void;
}

const REAL_TIMERS: SessionTimers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Uma sessão de escuta (sem React, para testar com um reconhecedor simulado). */
export function createSpeechSession(
  Ctor: RecognitionCtor,
  handlers: SessionHandlers,
  { silenceMs = SILENCE_MS, timers = REAL_TIMERS }: { silenceMs?: number; timers?: SessionTimers } = {},
) {
  const rec = new Ctor();
  rec.lang = SPEECH_LANG;
  rec.interimResults = true;
  rec.continuous = false;

  let finals = '';
  let interim = '';
  let errored = false;
  let ended = false;
  let timer: unknown = null;

  const text = () => `${finals} ${interim}`.replace(/\s+/g, ' ').trim();
  const disarm = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };

  rec.onstart = () => handlers.onStart?.();
  rec.onresult = (e) => {
    interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finals = `${finals} ${r[0].transcript}`;
      else interim += r[0].transcript;
    }
    handlers.onPartial?.(text());
    // Para sozinho depois de 2 s sem novas palavras
    disarm();
    timer = timers.set(() => rec.stop(), silenceMs);
  };
  rec.onerror = (e) => {
    errored = true;
    handlers.onError(errorKindOf(e.error));
  };
  rec.onend = () => {
    if (ended) return;
    ended = true;
    disarm();
    const final = text();
    if (final) handlers.onResult(final);
    else if (!errored) handlers.onError('no-speech');
    handlers.onEnd?.();
  };

  return {
    start() {
      rec.start();
    },
    /** Encerra pedindo o texto reconhecido até agora. */
    stop() {
      disarm();
      rec.stop();
    },
  };
}

const subscribeNever = () => () => undefined;

export interface UseSpeechInputOptions {
  /** Texto final da fala (a pessoa revisa; nada é enviado sozinho). */
  onResult: (text: string) => void;
}

/** O navegador reconhece voz? (false no servidor e na primeira renderização: nada de botão que pisca e some). */
export function useSpeechSupported() {
  return useSyncExternalStore(subscribeNever, () => getRecognitionCtor() !== null, () => false);
}

export function useSpeechInput({ onResult }: UseSpeechInputOptions) {
  const supported = useSpeechSupported();
  const [state, setState] = useState<SpeechState>('idle');
  const [error, setError] = useState<SpeechErrorKind | null>(null);
  const [partial, setPartial] = useState('');
  const session = useRef<ReturnType<typeof createSpeechSession> | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  const stop = useCallback(() => session.current?.stop(), []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('unsupported');
      setState('error');
      return;
    }
    setError(null);
    setPartial('');
    const s = createSpeechSession(Ctor, {
      onStart: () => setState('listening'),
      onPartial: setPartial,
      onResult: (t) => onResultRef.current(t),
      onError: (kind) => {
        setError(kind);
        setState('error');
      },
      onEnd: () => {
        setPartial('');
        session.current = null;
        setState((prev) => (prev === 'error' ? prev : 'idle'));
      },
    });
    session.current = s;
    setState('listening');
    try {
      s.start();
    } catch {
      session.current = null;
      setError('other');
      setState('error');
    }
  }, []);

  /** Toque no microfone: liga; tocando de novo, para. */
  const toggle = useCallback(() => (session.current ? stop() : start()), [start, stop]);

  useEffect(() => () => session.current?.stop(), []);

  return { supported, state, error, partial, listening: state === 'listening', start, stop, toggle };
}

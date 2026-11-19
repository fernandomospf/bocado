'use client';

import { tap } from '@/lib/haptics';
import { SPEECH_ERROR_TEXT, type useSpeechInput } from '@/lib/speech';
import { MicIcon } from './Icons';

type Speech = ReturnType<typeof useSpeechInput>;

/**
 * Botão do microfone (44 px, aria-pressed). SEM suporte do navegador ele não existe: nada de botão que não funciona.
 * Só o texto reconhecido chega ao Bocado; o áudio fica com o serviço de voz do navegador ou do sistema.
 */
export function MicButton({ speech, label = 'Falar' }: { speech: Speech; label?: string }) {
  if (!speech.supported) return null;
  return (
    <button
      type="button"
      className="btn btn-glass btn-icon mic-btn"
      aria-pressed={speech.listening}
      aria-label={speech.listening ? 'Parar de ouvir' : label}
      title={speech.listening ? 'Parar de ouvir' : label}
      data-listening={speech.listening || undefined}
      onClick={() => {
        tap();
        speech.toggle();
      }}
    >
      <MicIcon width={20} height={20} />
    </button>
  );
}

/** Ondas discretas (paradas com prefers-reduced-motion), o texto parcial e, se der erro, uma frase neutra. */
export function VoiceStatus({ speech }: { speech: Speech }) {
  if (!speech.supported) return null;
  const error = speech.state === 'error' && speech.error ? SPEECH_ERROR_TEXT[speech.error] : null;
  return (
    <div className="voice-status" role="status" aria-live="polite">
      {speech.listening && (
        <>
          <span className="voice-waves" aria-hidden>
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="voice-text">{speech.partial || 'Pode falar…'}</span>
        </>
      )}
      {error && <span className="caption">{error}</span>}
    </div>
  );
}

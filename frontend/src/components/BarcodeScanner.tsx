'use client';

import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { toApiBarcode } from '@/lib/barcode';
import { success as hapticSuccess } from '@/lib/haptics';
import { BarcodeIcon, CameraIcon } from './Icons';

/** API nativa (Chrome Android, Safari 17+). Não está nos tipos do TypeScript. */
interface NativeDetector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string; format: string }[]>;
}
interface NativeDetectorCtor {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const SCAN_INTERVAL_MS = 200;

type Status = 'starting' | 'scanning' | 'denied' | 'no-camera' | 'insecure' | 'error';

interface BarcodeScannerProps {
  onDetected: (code: string) => void;
  /** "Produto sem código de barras" (e saída quando a câmera não está disponível). */
  onNoBarcode: () => void;
}

/**
 * Leitor de código de barras pela câmera traseira. Usa o BarcodeDetector nativo quando existe; senão
 * carrega o @zxing/browser sob demanda (import dinâmico). A câmera para ao ler um código ou ao sair da tela.
 */
export function BarcodeScanner({ onDetected, onNoBarcode }: BarcodeScannerProps) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const stopFns = useRef<(() => void)[]>([]);
  const done = useRef(false);

  const [status, setStatus] = useState<Status>('starting');
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    stopFns.current.forEach((fn) => fn());
    stopFns.current = [];
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }, []);

  // O callback do pai muda a cada renderização; guardado numa ref, a câmera não reinicia por causa disso
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const handle = useCallback(
    (raw: string, format?: string) => {
      if (done.current) return;
      const code = toApiBarcode(raw, format);
      if (!code) return; // leitura falsa (dígito verificador não bate): continua lendo
      done.current = true;
      stopCamera();
      hapticSuccess();
      onDetectedRef.current(code);
    },
    [stopCamera],
  );

  useEffect(() => {
    let cancelled = false;
    done.current = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(window.isSecureContext ? 'no-camera' : 'insecure');
        return;
      }
      try {
        const media = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          media.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = media;
        const el = video.current!;
        el.srcObject = media;
        await el.play();

        const track = media.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
        setTorch({ available: !!caps.torch, on: false });
        setStatus('scanning');

        const Native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
        const supported = Native ? await Native.getSupportedFormats().catch(() => [] as string[]) : [];
        const formats = FORMATS.filter((f) => supported.includes(f));

        if (Native && formats.length > 0) {
          const detector = new Native({ formats });
          const timer = window.setInterval(async () => {
            if (done.current || el.readyState < 2) return;
            try {
              const [hit] = await detector.detect(el);
              if (hit) handle(hit.rawValue, hit.format);
            } catch {
              // quadro sem código ou ainda carregando: tenta no próximo
            }
          }, SCAN_INTERVAL_MS);
          stopFns.current.push(() => window.clearInterval(timer));
        } else {
          // Sem leitor nativo (Firefox, desktop): carrega o ZXing só agora
          const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
            import('@zxing/browser'),
            import('@zxing/library'),
          ]);
          if (cancelled || done.current) return;
          const hints = new Map([
            [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
          ]);
          const reader = new BrowserMultiFormatReader(hints);
          const controls = await reader.decodeFromVideoElement(el, (result) => {
            if (result) handle(result.getText(), BarcodeFormat[result.getBarcodeFormat()]);
          });
          stopFns.current.push(() => controls.stop());
        }
      } catch (err) {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') setStatus('denied');
        else if (name === 'NotFoundError' || name === 'OverconstrainedError') setStatus('no-camera');
        else setStatus('error');
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [handle, stopCamera]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try {
      await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch((t) => ({ ...t, on }));
    } catch {
      setTorch({ available: false, on: false });
    }
  }

  function submitTyped(e: FormEvent) {
    e.preventDefault();
    const code = toApiBarcode(typed);
    if (!code) {
      setTypedError('Código inválido. Confira os números (8, 12 ou 13 dígitos).');
      return;
    }
    done.current = true;
    stopCamera();
    onDetectedRef.current(code);
  }

  const problem =
    status === 'denied'
      ? 'Sem permissão para usar a câmera. Libere o acesso nas configurações do navegador, ou digite o código.'
      : status === 'no-camera'
        ? 'Não encontramos uma câmera neste aparelho. Digite o código ou fotografe a tabela nutricional.'
        : status === 'insecure'
          ? 'A câmera só funciona em conexão segura (HTTPS). Digite o código ou fotografe a tabela nutricional.'
          : status === 'error'
            ? 'Não foi possível abrir a câmera. Digite o código ou fotografe a tabela nutricional.'
            : null;

  return (
    <section className="stack" aria-label="Ler código de barras">
      {problem ? (
        <div className="card glass stack" role="alert">
          <p className="body-2">{problem}</p>
        </div>
      ) : (
        <div className="scanner glass">
          <video ref={video} className="scanner-video" muted playsInline aria-label="Câmera para ler o código de barras" />
          <div className="scanner-frame" aria-hidden>
            <span />
          </div>
          <p className="scanner-hint">
            {status === 'starting' ? 'Abrindo a câmera…' : 'Aponte para o código de barras da embalagem'}
          </p>
        </div>
      )}

      {manual || problem ? (
        <form className="card glass stack" onSubmit={submitTyped}>
          <label className="field">
            <span className="field-label">Código de barras</span>
            <input
              className="input num"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Ex.: 7891000100080"
              maxLength={16}
              value={typed}
              onChange={(e) => {
                setTyped(e.target.value.replace(/[^\d\s-]/g, ''));
                setTypedError(null);
              }}
              autoFocus={manual}
            />
          </label>
          {typedError && (
            <p className="alert" role="alert">
              {typedError}
            </p>
          )}
          <button type="submit" className="btn btn-primary btn-block" disabled={typed.replace(/\D/g, '').length < 8}>
            Buscar produto
          </button>
        </form>
      ) : null}

      <div className="scanner-actions">
        {torch.available && (
          <button type="button" className="btn btn-glass btn-sm" onClick={toggleTorch} aria-pressed={torch.on}>
            {torch.on ? 'Apagar lanterna' : 'Lanterna'}
          </button>
        )}
        {!manual && !problem && (
          <button type="button" className="btn btn-glass btn-sm" onClick={() => setManual(true)}>
            <BarcodeIcon width={18} height={18} />
            Digitar código
          </button>
        )}
        <button type="button" className="btn btn-plain btn-sm" onClick={onNoBarcode}>
          <CameraIcon width={18} height={18} />
          Produto sem código de barras
        </button>
      </div>
    </section>
  );
}

/// <reference lib="webworker" />
import { AppleHealthScanner } from './apple-health.ts';

/**
 * Web Worker do App Saúde: lê o export.xml em streaming (file.stream() + TextDecoder), manda o progresso e, no fim, só
 * os registros de peso. Cancelar = o app encerra o worker. O arquivo nunca sai do aparelho.
 */
export interface WorkerRequest {
  file: File;
}
export type WorkerMessage =
  | { kind: 'progress'; read: number; total: number; found: number }
  | { kind: 'done'; readings: { date: string; value: number; unit: 'kg' | 'lb' }[]; skipped: number }
  | { kind: 'error'; message: string };

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { file } = e.data;
  try {
    const scanner = new AppleHealthScanner();
    const reader = file.stream().getReader();
    const decoder = new TextDecoder('utf-8');
    let read = 0;
    let lastReport = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      read += value.byteLength;
      scanner.push(decoder.decode(value, { stream: true }));
      const now = performance.now();
      if (now - lastReport > 120) {
        lastReport = now;
        (self as unknown as Worker).postMessage({ kind: 'progress', read, total: file.size, found: scanner.stats.found } satisfies WorkerMessage);
      }
    }
    scanner.push(decoder.decode());
    (self as unknown as Worker).postMessage({ kind: 'done', readings: scanner.readings, skipped: scanner.stats.skipped } satisfies WorkerMessage);
  } catch (err) {
    (self as unknown as Worker).postMessage({ kind: 'error', message: err instanceof Error ? err.message : 'Não foi possível ler o arquivo.' } satisfies WorkerMessage);
  }
};

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '@/lib/api';
import { todayISO } from '@/lib/date';
import { fmtDec, fmtInt } from '@/lib/format';
import { saveFile } from '@/lib/saveFile';
import { ZIP_HELP } from '@/lib/weight-import/apple-health.ts';
import {
  CSV_TEMPLATE,
  type CsvTable,
  type DateFormat,
  detectColumns,
  detectDateFormat,
  parseCsv,
  readCsvRows,
  unitFromHeader,
} from '@/lib/weight-import/csv.ts';
import { buildPreview, DISCARD_LABEL, type Discarded, type ImportPreview, type RawReading, toBatches, type Unit } from '@/lib/weight-import/normalize.ts';
import type { WorkerMessage } from '@/lib/weight-import/worker.ts';
import { Sheet } from './Sheet';
import { useToast } from './Toast';

type Source = 'CSV' | 'APPLE_HEALTH';
type Step = 'source' | 'preview' | 'done';
type Conflict = 'keep' | 'replace';

interface ImportResult {
  importId: string;
  created: number;
  replaced: number;
  kept: number;
}

const dm = (iso: string) => iso.split('-').reverse().join('/');

/** Importar histórico de peso: origem, prévia e conclusão. O arquivo é lido AQUI, no aparelho; só datas e pesos são enviados. */
export function WeightImportSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void | Promise<void> }) {
  const toast = useToast();
  const today = todayISO();
  const [step, setStep] = useState<Step>('source');
  const [source, setSource] = useState<Source>('CSV');
  const [fileName, setFileName] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // CSV
  const [table, setTable] = useState<CsvTable | null>(null);
  const [dateCol, setDateCol] = useState(-1);
  const [weightCol, setWeightCol] = useState(-1);
  const [format, setFormat] = useState<DateFormat | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const [unit, setUnit] = useState<Unit>('kg');
  const [unitGuessed, setUnitGuessed] = useState(false);

  // App Saúde
  const [apple, setApple] = useState<RawReading[] | null>(null);
  const [progress, setProgress] = useState<{ read: number; total: number; found: number } | null>(null);
  const worker = useRef<Worker | null>(null);

  const [conflict, setConflict] = useState<Conflict>('keep');
  const [sending, setSending] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [undone, setUndone] = useState(false);

  useEffect(() => () => worker.current?.terminate(), []);

  const csvRead = useMemo(() => {
    if (!table || dateCol < 0 || weightCol < 0 || !format) return null;
    return readCsvRows(table, { dateCol, weightCol, format, unit });
  }, [table, dateCol, weightCol, format, unit]);

  const readings = source === 'CSV' ? (csvRead?.readings ?? null) : apple;
  const preview: ImportPreview | null = useMemo(() => (readings ? buildPreview(readings, today) : null), [readings, today]);

  function reset() {
    worker.current?.terminate();
    worker.current = null;
    setTable(null);
    setApple(null);
    setProgress(null);
    setMessage(null);
    setFileName('');
    setStep('source');
  }

  async function chooseFile(file: File) {
    setMessage(null);
    setFileName(file.name);
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.zip')) {
      setMessage(ZIP_HELP);
      return;
    }
    if (source === 'APPLE_HEALTH') return readApple(file);
    if (lower.endsWith('.xml')) {
      setSource('APPLE_HEALTH');
      return readApple(file);
    }
    if (file.size > 30 * 1024 * 1024) {
      setMessage('Esse arquivo é grande demais para um CSV de peso. Confira se é o arquivo certo.');
      return;
    }
    const t = parseCsv(await file.text());
    if (t.rows.length === 0) {
      setMessage('Não encontrei linhas de dados nesse arquivo.');
      return;
    }
    const cols = detectColumns(t.header, t.rows);
    const fmt = detectDateFormat(cols.date >= 0 ? t.rows.map((r) => r[cols.date] ?? '') : []);
    const headerUnit = cols.weight >= 0 ? unitFromHeader(t.header[cols.weight]) : null;
    setTable(t);
    setDateCol(cols.date);
    setWeightCol(cols.weight);
    setFormat(fmt.format);
    setAmbiguous(fmt.ambiguous);
    setUnit(headerUnit ?? 'kg');
    setUnitGuessed(headerUnit === null);
    setStep('preview');
  }

  function readApple(file: File) {
    worker.current?.terminate();
    setProgress({ read: 0, total: file.size, found: 0 });
    const w = new Worker(new URL('../lib/weight-import/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const m = e.data;
      if (m.kind === 'progress') setProgress({ read: m.read, total: m.total, found: m.found });
      else if (m.kind === 'done') {
        w.terminate();
        worker.current = null;
        setProgress(null);
        if (m.readings.length === 0) setMessage('Não encontrei registros de peso nesse arquivo. Confira se é o export.xml do app Saúde.');
        else {
          setApple(m.readings);
          setStep('preview');
        }
      } else {
        w.terminate();
        worker.current = null;
        setProgress(null);
        setMessage(m.message);
      }
    };
    w.onerror = () => {
      w.terminate();
      worker.current = null;
      setProgress(null);
      setMessage('Não foi possível ler o arquivo neste navegador.');
    };
    w.postMessage({ file });
  }

  function cancelRead() {
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setFileName('');
  }

  async function send() {
    if (!preview || preview.entries.length === 0) return;
    const batches = toBatches(preview.entries.map((e) => ({ date: e.date, weightKg: e.weightKg })));
    setSending({ done: 0, total: preview.entries.length });
    const total: ImportResult = { importId: '', created: 0, replaced: 0, kept: 0 };
    try {
      let importId: string | undefined;
      let done = 0;
      for (const entries of batches) {
        const r = await api<ImportResult>('/weight/import', { method: 'POST', json: { source, conflict, entries, ...(importId ? { importId } : {}) } });
        importId = r.importId;
        total.importId = r.importId;
        total.created += r.created;
        total.replaced += r.replaced;
        total.kept += r.kept;
        done += entries.length;
        setSending({ done, total: preview.entries.length });
      }
      setResult(total);
      setStep('done');
      await onChanged();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    } finally {
      setSending(null);
    }
  }

  async function undo() {
    if (!result) return;
    try {
      await api(`/weight/import/${result.importId}`, { method: 'DELETE' });
      setUndone(true);
      await onChanged();
    } catch (err) {
      toast.show({ message: errorMessage(err), tone: 'error' });
    }
  }

  const needsPick = step === 'preview' && source === 'CSV' && (dateCol < 0 || weightCol < 0 || format === null);

  return (
    <Sheet open title="Importar histórico de peso" onClose={onClose}>
      <div className="stack-lg">
        <div>
          <h2 className="title">Importar histórico de peso</h2>
          <p className="caption">O arquivo é lido no seu aparelho. Só as datas e os pesos são enviados.</p>
        </div>

        {step === 'source' && (
          <>
            <div className="segmented" role="group" aria-label="Origem">
              <button type="button" aria-pressed={source === 'CSV'} onClick={() => setSource('CSV')}>
                CSV
              </button>
              <button type="button" aria-pressed={source === 'APPLE_HEALTH'} onClick={() => setSource('APPLE_HEALTH')}>
                App Saúde
              </button>
            </div>

            {source === 'CSV' ? (
              <div className="stack-sm">
                <p className="body-2">
                  Um CSV com uma coluna de data e outra de peso (balanças, planilhas e outros apps exportam assim). Aceito separador
                  ; , ou tab, datas DD/MM/AAAA, AAAA-MM-DD ou MM/DD/AAAA, e kg ou lb.
                </p>
                <button
                  type="button"
                  className="btn btn-plain btn-sm"
                  style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                  onClick={() => void saveFile(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }), 'modelo-peso-bocado.csv')}
                >
                  Baixar um modelo
                </button>
              </div>
            ) : (
              <ol className="stack-sm import-steps">
                <li>No iPhone, abra o app Saúde e toque na sua foto (canto superior).</li>
                <li>Toque em &ldquo;Exportar Todos os Dados de Saúde&rdquo; e salve o arquivo.</li>
                <li>Extraia o .zip (toque nele no app Arquivos) e escolha o arquivo <strong>export.xml</strong> aqui.</li>
              </ol>
            )}

            {progress ? (
              <div className="stack-sm" role="status">
                <span className="fast-bar fast-bar-lg" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((progress.read / Math.max(progress.total, 1)) * 100)} aria-label="Lendo o arquivo">
                  <span style={{ width: `${Math.round((progress.read / Math.max(progress.total, 1)) * 100)}%` }} />
                </span>
                <p className="caption num">
                  Lendo {fileName} · {fmtInt(progress.read / 1_048_576)} de {fmtInt(progress.total / 1_048_576)} MB · {fmtInt(progress.found)} pesos encontrados
                </p>
                <button type="button" className="btn btn-glass btn-block" onClick={cancelRead}>
                  Cancelar
                </button>
              </div>
            ) : (
              <label className="btn btn-primary btn-block file-pick">
                Escolher arquivo
                <input
                  type="file"
                  className="sr-only"
                  accept={source === 'CSV' ? '.csv,.txt,text/csv,text/plain' : '.xml,text/xml,application/xml'}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void chooseFile(f);
                  }}
                />
              </label>
            )}
            {message && (
              <p className="note" role="status">
                {message}
              </p>
            )}
          </>
        )}

        {step === 'preview' && (
          <>
            <p className="caption">{fileName}</p>

            {source === 'CSV' && table && (
              <div className="stack-sm">
                <div className="grid-2">
                  <label className="field">
                    <span className="field-label">Coluna da data</span>
                    <select className="input" value={dateCol} onChange={(e) => setDateCol(Number(e.target.value))}>
                      <option value={-1}>Escolha…</option>
                      {table.header.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Coluna do peso</span>
                    <select className="input" value={weightCol} onChange={(e) => setWeightCol(Number(e.target.value))}>
                      <option value={-1}>Escolha…</option>
                      {table.header.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {(ambiguous || format === null) && dateCol >= 0 && (
                  <div className="stack-sm" role="group" aria-label="Formato da data">
                    <span className="field-label">{ambiguous ? 'As datas podem ser lidas de dois jeitos. Qual é o seu?' : 'Formato da data'}</span>
                    <div className="segmented">
                      <button type="button" aria-pressed={format === 'dmy'} onClick={() => setFormat('dmy')}>
                        Dia/mês
                      </button>
                      <button type="button" aria-pressed={format === 'mdy'} onClick={() => setFormat('mdy')}>
                        Mês/dia
                      </button>
                    </div>
                    {table.rows[0]?.[dateCol] && <p className="caption">Primeira data do arquivo: {table.rows[0][dateCol]}</p>}
                  </div>
                )}
                <div className="stack-sm" role="group" aria-label="Unidade do peso">
                  <span className="field-label">Unidade do peso</span>
                  <div className="segmented">
                    <button type="button" aria-pressed={unit === 'kg'} onClick={() => setUnit('kg')}>
                      kg
                    </button>
                    <button type="button" aria-pressed={unit === 'lb'} onClick={() => setUnit('lb')}>
                      lb (libras)
                    </button>
                  </div>
                  {unitGuessed && <p className="caption">O arquivo não diz a unidade: sugeri kg. Troque se for libras.</p>}
                </div>
                {csvRead && csvRead.unreadable > 0 && <p className="caption">{csvRead.unreadable} linhas não puderam ser lidas.</p>}
              </div>
            )}

            {needsPick && <p className="note">Escolha as colunas e o formato da data para ver a prévia.</p>}

            {preview && !needsPick && <Preview preview={preview} source={source} conflict={conflict} onConflict={setConflict} />}

            <div className="stack">
              <button type="button" className="btn btn-primary btn-block" disabled={!preview || preview.entries.length === 0 || needsPick || !!sending} onClick={send}>
                {sending ? <span className="spinner" aria-label="Importando" /> : preview ? `Importar ${fmtInt(preview.entries.length)} registros` : 'Importar'}
              </button>
              {sending && (
                <p className="caption num" role="status">
                  Enviando {fmtInt(sending.done)} de {fmtInt(sending.total)}
                </p>
              )}
              <button type="button" className="btn btn-plain btn-block" disabled={!!sending} onClick={reset}>
                Escolher outro arquivo
              </button>
            </div>
          </>
        )}

        {step === 'done' && result && (
          <div className="stack-lg">
            {undone ? (
              <p className="body-2" role="status">
                Importação desfeita. Os registros que ela criou foram apagados.
              </p>
            ) : (
              <>
                <p className="headline num" role="status">
                  {fmtInt(result.created + result.replaced)} registros importados
                </p>
                <p className="caption">
                  {result.created} novos{result.replaced > 0 ? ` · ${result.replaced} substituídos` : ''}
                  {result.kept > 0 ? ` · ${result.kept} dias já tinham registro e foram mantidos` : ''}
                </p>
              </>
            )}
            <div className="stack">
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  onClose();
                  setTimeout(() => document.getElementById('peso')?.scrollIntoView({ behavior: 'smooth' }), 150);
                }}
              >
                Ver o gráfico
              </button>
              {!undone && (
                <button type="button" className="btn btn-plain btn-block" onClick={undo}>
                  Desfazer importação
                </button>
              )}
            </div>
            {!undone && result.replaced > 0 && <p className="caption">Ao desfazer, os registros substituídos ficam com o valor importado: os originais não voltam.</p>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Preview({ preview, source, conflict, onConflict }: { preview: ImportPreview; source: Source; conflict: Conflict; onConflict: (c: Conflict) => void }) {
  const p = preview;
  return (
    <div className="stack-lg">
      {p.entries.length === 0 ? (
        <p className="note">Nenhum registro válido nesse arquivo.</p>
      ) : (
        <>
          <ul className="import-summary">
            <li>
              <strong className="num">{fmtInt(p.entries.length)}</strong> dias com peso
              {p.totalReadings !== p.entries.length ? ` (de ${fmtInt(p.totalReadings)} registros no arquivo)` : ''}
            </li>
            {p.period && (
              <li>
                De <strong className="num">{dm(p.period.from)}</strong> a <strong className="num">{dm(p.period.to)}</strong>
              </li>
            )}
            <li>Unidade: {source === 'APPLE_HEALTH' ? 'kg e lb, convertidos para kg' : 'convertida para kg quando preciso'}</li>
            {p.averagedDays > 0 && <li>{fmtInt(p.averagedDays)} dias tinham mais de um registro: usei a média do dia.</li>}
          </ul>

          <Spark entries={p.entries} />

          {p.discardedTotal > 0 && (
            <details className="adaptive-how">
              <summary>{fmtInt(p.discardedTotal)} registros descartados</summary>
              <ul className="stack-sm" style={{ paddingLeft: 18, margin: '8px 0 0' }}>
                {(Object.keys(p.discarded) as (keyof Discarded)[])
                  .filter((k) => p.discarded[k] > 0)
                  .map((k) => (
                    <li key={k} className="caption">
                      {p.discarded[k]} · {DISCARD_LABEL[k]}
                    </li>
                  ))}
              </ul>
            </details>
          )}

          {p.jumps.length > 0 && (
            <details className="adaptive-how" open>
              <summary>
                {p.jumps.length} {p.jumps.length === 1 ? 'salto' : 'saltos'} para conferir (mais de 5 kg entre dias seguidos)
              </summary>
              <ul className="stack-sm" style={{ paddingLeft: 18, margin: '8px 0 0' }}>
                {p.jumps.slice(0, 8).map((j) => (
                  <li key={j.to} className="caption num">
                    {dm(j.from)} → {dm(j.to)}: {fmtDec(j.fromKg)} → {fmtDec(j.toKg)} kg
                  </li>
                ))}
                {p.jumps.length > 8 && <li className="caption">e mais {p.jumps.length - 8}</li>}
              </ul>
              <p className="caption" style={{ marginTop: 6 }}>
                É só um aviso: se os valores estiverem certos, pode importar.
              </p>
            </details>
          )}

          <fieldset className="stack-sm import-conflict">
            <legend className="field-label">Se já houver peso no mesmo dia</legend>
            <label className="check-row">
              <input type="radio" name="conflict" checked={conflict === 'keep'} onChange={() => onConflict('keep')} />
              <span>Manter os meus</span>
            </label>
            <label className="check-row">
              <input type="radio" name="conflict" checked={conflict === 'replace'} onChange={() => onConflict('replace')} />
              <span>Substituir pelos importados</span>
            </label>
            {conflict === 'replace' && (
              <p className="caption">Os valores substituídos não voltam, nem ao desfazer a importação. Desfazer apaga só os registros que ela criou.</p>
            )}
          </fieldset>
        </>
      )}
    </div>
  );
}

/** Mini gráfico dos dados que serão importados (decorativo com descrição para leitor de tela). */
function Spark({ entries }: { entries: { date: string; weightKg: number }[] }) {
  const W = 300;
  const H = 64;
  const kgs = entries.map((e) => e.weightKg);
  const min = Math.min(...kgs);
  const max = Math.max(...kgs);
  const span = Math.max(max - min, 1);
  // Amostra até 300 pontos para não pesar com milhares de dias
  const step = Math.max(1, Math.ceil(entries.length / 300));
  const pts = entries.filter((_, i) => i % step === 0 || i === entries.length - 1);
  const x = (i: number) => (pts.length <= 1 ? W / 2 : (i / (pts.length - 1)) * W);
  const y = (kg: number) => H - 4 - ((kg - min) / span) * (H - 8);
  const d = pts.map((e, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(e.weightKg).toFixed(1)}`).join(' ');
  return (
    <figure className="import-spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Prévia: de ${fmtDec(kgs[0])} kg a ${fmtDec(kgs[kgs.length - 1])} kg, entre ${fmtDec(min)} e ${fmtDec(max)} kg`} preserveAspectRatio="none">
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="caption num">
        {fmtDec(min)} – {fmtDec(max)} kg
      </figcaption>
    </figure>
  );
}

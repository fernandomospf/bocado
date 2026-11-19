// Importar histórico de peso: CSV, App Saúde, normalização, média por dia, limites e lotes. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppleHealthScanner, localDay, scanAppleHealth } from './weight-import/apple-health.ts';
import { detectColumns, detectDateFormat, detectDelimiter, parseCsv, parseDay, parseWeightCell, readCsvRows, unitFromHeader } from './weight-import/csv.ts';
import { buildPreview, JUMP_KG, LB_TO_KG, toBatches, toKg } from './weight-import/normalize.ts';

const TODAY = '2026-11-20';

// Amostras anonimizadas no formato real de cada origem
const CSV_BR = 'Data;Peso (kg);Gordura (%)\r\n15/11/2026;82,4;21,0\r\n16/11/2026;82,1;20,8\r\n17/11/2026;81,9;20,9\r\n';
const CSV_EN_LB = 'Date,Weight (lbs),Body Fat\n2026-11-15,181.6,21\n2026-11-16,181.0,20.8\n';
const CSV_TAB = 'dia\tmassa corporal\n2026-11-15 07:31\t82.4\n2026-11-15 20:10\t83.0\n';
const CSV_AMBIG = 'data;peso\n03/04/2026;80\n05/06/2026;80,5\n';
const CSV_US = 'date,weight\n11/15/2026,180\n11/16/2026,179.5\n';

const APPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [ <!ELEMENT HealthData (ExportDate,Me,(Record|Correlation|Workout|ActivitySummary)*)> ]>
<HealthData locale="pt_BR">
 <ExportDate value="2026-11-19 09:00:00 -0300"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="1990-01-01"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" creationDate="2026-11-15 10:00:00 -0300" startDate="2026-11-15 09:00:00 -0300" endDate="2026-11-15 09:05:00 -0300" value="412"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Balança" sourceVersion="1.0" unit="kg" creationDate="2026-11-15 07:31:00 -0300" startDate="2026-11-15 07:30:00 -0300" endDate="2026-11-15 07:30:00 -0300" value="82.4">
  <MetadataEntry key="HKWasUserEntered" value="0"/>
 </Record>
 <Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Saúde" unit="lb" startDate="2026-11-16 08:00:00 -0300" endDate="2026-11-16 08:00:00 -0300" value="181.2"/>
 <Record type="HKQuantityTypeIdentifierHeartRate" unit="count/min" startDate="2026-11-16 08:00:00 -0300" value="61"/>
 <Record type="HKQuantityTypeIdentifierBodyMass" unit="g" startDate="2026-11-17 08:00:00 -0300" value="82000"/>
</HealthData>`;

describe('CSV: separador, cabeçalho e colunas', () => {
  it('detecta ; , e tab', () => {
    assert.equal(detectDelimiter(CSV_BR), ';');
    assert.equal(detectDelimiter(CSV_EN_LB), ',');
    assert.equal(detectDelimiter(CSV_TAB), '\t');
  });
  it('acha as colunas de data e peso pelo nome (sem confundir com gordura)', () => {
    const t = parseCsv(CSV_BR);
    assert.equal(t.hasHeader, true);
    assert.deepEqual(detectColumns(t.header, t.rows), { date: 0, weight: 1 });
    const en = parseCsv(CSV_EN_LB);
    assert.deepEqual(detectColumns(en.header, en.rows), { date: 0, weight: 1 });
    const tab = parseCsv(CSV_TAB);
    assert.deepEqual(detectColumns(tab.header, tab.rows), { date: 0, weight: 1 });
  });
  it('sem cabeçalho: acha pelo conteúdo', () => {
    const t = parseCsv('15/11/2026;82,4\n16/11/2026;82,1\n17/11/2026;81,9\n');
    assert.equal(t.hasHeader, false);
    assert.deepEqual(detectColumns(t.header, t.rows), { date: 0, weight: 1 });
  });
  it('nome desconhecido => -1 (a pessoa escolhe no seletor)', () => {
    const t = parseCsv('a;b\nx;y\nz;w\n');
    assert.deepEqual(detectColumns(t.header, t.rows), { date: -1, weight: -1 });
  });
  it('respeita aspas e o BOM', () => {
    const t = parseCsv('﻿"Data";"Peso"\n"15/11/2026";"82,4"\n');
    assert.deepEqual(t.header, ['Data', 'Peso']);
    assert.deepEqual(t.rows[0], ['15/11/2026', '82,4']);
  });
});

describe('CSV: datas', () => {
  it('ISO é sempre inequívoca, com ou sem hora', () => {
    assert.deepEqual(detectDateFormat(['2026-11-15', '2026-11-16 07:30']), { format: 'ymd', ambiguous: false });
    assert.equal(parseDay('2026-11-15 07:31', 'ymd'), '2026-11-15');
  });
  it('DD/MM/AAAA e MM/DD/AAAA são distinguidos quando um dia passa de 12', () => {
    assert.deepEqual(detectDateFormat(['15/11/2026', '16/11/2026']), { format: 'dmy', ambiguous: false });
    assert.deepEqual(detectDateFormat(['11/15/2026', '11/16/2026']), { format: 'mdy', ambiguous: false });
    assert.equal(parseDay('15/11/2026 07:30', 'dmy'), '2026-11-15');
    assert.equal(parseDay('11/15/2026', 'mdy'), '2026-11-15');
  });
  it('AMBÍGUA quando todos os campos são <= 12: a interface pergunta', () => {
    assert.deepEqual(detectDateFormat(['03/04/2026', '05/06/2026']), { format: null, ambiguous: true });
    assert.equal(parseDay('03/04/2026', 'dmy'), '2026-04-03');
    assert.equal(parseDay('03/04/2026', 'mdy'), '2026-03-04');
  });
  it('datas impossíveis viram null', () => {
    assert.equal(parseDay('31/02/2026', 'dmy'), null);
    assert.equal(parseDay('banana', 'dmy'), null);
  });
});

describe('CSV: números e unidade', () => {
  it('vírgula ou ponto decimal, milhar e unidade na célula', () => {
    assert.deepEqual(parseWeightCell('82,4'), { value: 82.4, unit: null });
    assert.deepEqual(parseWeightCell('82.4'), { value: 82.4, unit: null });
    assert.deepEqual(parseWeightCell('1.234,5'), { value: 1234.5, unit: null });
    assert.deepEqual(parseWeightCell('180 lbs'), { value: 180, unit: 'lb' });
    assert.deepEqual(parseWeightCell('82,4 kg'), { value: 82.4, unit: 'kg' });
    assert.equal(parseWeightCell('abc'), null);
    assert.equal(parseWeightCell(''), null);
  });
  it('"lb/lbs" no cabeçalho vira libras; sem indicação, nada (o app sugere kg)', () => {
    assert.equal(unitFromHeader('Weight (lbs)'), 'lb');
    assert.equal(unitFromHeader('Peso (kg)'), 'kg');
    assert.equal(unitFromHeader('Peso'), null);
  });
  it('1 lb = 0,45359237 kg, 1 casa', () => {
    assert.equal(LB_TO_KG, 0.45359237);
    assert.equal(toKg(181.6, 'lb'), 82.4);
    assert.equal(toKg(82.44, 'kg'), 82.4);
  });
});

describe('CSV: leitura completa', () => {
  it('BR com ; e vírgula', () => {
    const t = parseCsv(CSV_BR);
    const { readings, unreadable } = readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'dmy', unit: 'kg' });
    assert.equal(unreadable, 0);
    assert.deepEqual(readings.map((r) => [r.date, r.value]), [['2026-11-15', 82.4], ['2026-11-16', 82.1], ['2026-11-17', 81.9]]);
  });
  it('em libras pelo cabeçalho', () => {
    const t = parseCsv(CSV_EN_LB);
    const unit = unitFromHeader(t.header[1]) ?? 'kg';
    const p = buildPreview(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'ymd', unit }).readings, TODAY);
    assert.deepEqual(p.entries.map((e) => e.weightKg), [82.4, 82.1]);
  });
  it('tab, hora e vários registros no mesmo dia: média do dia', () => {
    const t = parseCsv(CSV_TAB);
    const p = buildPreview(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'ymd', unit: 'kg' }).readings, TODAY);
    assert.equal(p.entries.length, 1);
    assert.deepEqual([p.entries[0].weightKg, p.entries[0].readings, p.averagedDays, p.totalReadings], [82.7, 2, 1, 2]);
  });
  it('MM/DD americano', () => {
    const t = parseCsv(CSV_US);
    const f = detectDateFormat(t.rows.map((r) => r[0]));
    assert.equal(f.format, 'mdy');
    assert.equal(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'mdy', unit: 'kg' }).readings[0].date, '2026-11-15');
  });
  it('ambíguo: a escolha da pessoa muda o resultado', () => {
    const t = parseCsv(CSV_AMBIG);
    assert.equal(detectDateFormat(t.rows.map((r) => r[0])).ambiguous, true);
    assert.equal(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'dmy', unit: 'kg' }).readings[0].date, '2026-04-03');
    assert.equal(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'mdy', unit: 'kg' }).readings[0].date, '2026-03-04');
  });
  it('linhas ilegíveis são contadas', () => {
    const t = parseCsv('data;peso\n15/11/2026;82,4\nlixo;x\n16/11/2026;\n');
    assert.equal(readCsvRows(t, { dateCol: 0, weightCol: 1, format: 'dmy', unit: 'kg' }).unreadable, 2);
  });
});

describe('normalização', () => {
  const r = (date, value, unit = 'kg') => ({ date, value, unit });
  it('descarta fora de 30 a 350 kg, datas futuras, antes de 1950 e inválidas, com os motivos', () => {
    const p = buildPreview(
      [r('2026-11-10', 29.9), r('2026-11-10', 350.1), r('2026-11-11', 30), r('2026-11-12', 350), r('2026-11-21', 80), r('1949-12-31', 80), r('2026-02-30', 80), r('2026-11-13', Number.NaN)],
      TODAY,
    );
    assert.deepEqual(p.entries.map((e) => e.weightKg), [30, 350]);
    assert.deepEqual(p.discarded, { outOfRange: 2, futureDate: 1, beforeMin: 1, invalid: 2 });
    assert.equal(p.discardedTotal, 6);
  });
  it('libras fora do limite depois de convertidas também saem (60 lb = 27,2 kg)', () => {
    assert.equal(buildPreview([r('2026-11-10', 60, 'lb')], TODAY).entries.length, 0);
  });
  it('período, ordenação e saltos suspeitos entre dias seguidos (sem bloquear)', () => {
    const p = buildPreview([r('2026-11-12', 90), r('2026-11-10', 80), r('2026-11-11', 80.5), r('2026-11-20', 70)], TODAY);
    assert.deepEqual(p.period, { from: '2026-11-10', to: '2026-11-20' });
    assert.equal(JUMP_KG, 5);
    assert.deepEqual(p.jumps.map((j) => [j.from, j.to, j.diffKg]), [['2026-11-11', '2026-11-12', 9.5]]);
    // 12 -> 20 não são dias seguidos: não conta como salto
    assert.equal(p.jumps.length, 1);
  });
  it('lotes de até 5.000 do mesmo import', () => {
    const items = Array.from({ length: 12_345 }, (_, i) => i);
    const b = toBatches(items);
    assert.deepEqual(b.map((x) => x.length), [5000, 5000, 2345]);
    assert.equal(toBatches([]).length, 0);
  });
});

describe('App Saúde (export.xml)', () => {
  it('extrai só o BodyMass (kg e lb) e ignora o resto', () => {
    const { readings, stats } = scanAppleHealth(APPLE_XML, -180);
    assert.deepEqual(readings, [
      { date: '2026-11-15', value: 82.4, unit: 'kg' },
      { date: '2026-11-16', value: 181.2, unit: 'lb' },
    ]);
    assert.deepEqual(stats, { found: 2, skipped: 1 }); // a unidade "g" não é aceita
    const p = buildPreview(readings, TODAY);
    assert.deepEqual(p.entries.map((e) => e.weightKg), [82.4, 82.2]);
  });
  it('em streaming: qualquer corte entre pedaços dá o mesmo resultado', () => {
    const whole = scanAppleHealth(APPLE_XML, -180).readings;
    for (const size of [1, 2, 7, 33, 64, 500]) {
      const s = new AppleHealthScanner(-180);
      for (let i = 0; i < APPLE_XML.length; i += size) s.push(APPLE_XML.slice(i, i + size));
      assert.deepEqual(s.readings, whole, `pedaços de ${size}`);
    }
  });
  it('o dia vale no fuso do aparelho (instante, não o texto)', () => {
    assert.equal(localDay('2026-11-15 23:30:00 -0300', -180), '2026-11-15');
    assert.equal(localDay('2026-11-15 23:30:00 -0300', 0), '2026-11-16'); // em UTC já é o dia seguinte
    assert.equal(localDay('2026-11-15 07:30:00', 0), '2026-11-15'); // sem fuso no texto: o dia escrito
    assert.equal(localDay('lixo'), null);
  });
  it('arquivo cortado/corrompido não trava nem cresce sem limite', () => {
    const s = new AppleHealthScanner(0);
    s.push('<Record type="HKQuantityTypeIdentifierBodyMass" ' + 'x'.repeat(30_000));
    s.push('</HealthData>');
    assert.deepEqual(s.readings, []);
  });
});

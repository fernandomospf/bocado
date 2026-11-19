// Atalhos /rapido/: validação dos parâmetros, links e retorno seguro depois do login. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseFast, parseMealMode, parseWater, parseWorkout, QUICK_PATHS, readDefaults, RETURN_KEY, safeReturnPath, SHORTCUT_DEFAULTS, storeReturnPath, takeReturnPath,
} from './quickActions.ts';

const q = (s) => new URLSearchParams(s);

describe('água', () => {
  it('de 50 a 2000 ml é válido; sem parâmetro usa o padrão', () => {
    assert.deepEqual(parseWater(q('ml=200')), { ml: 200, valid: true });
    assert.deepEqual(parseWater(q('ml=50')), { ml: 50, valid: true });
    assert.deepEqual(parseWater(q('ml=2000')), { ml: 2000, valid: true });
    assert.deepEqual(parseWater(q('')), { ml: 200, valid: true });
    assert.deepEqual(parseWater(q(''), 300), { ml: 300, valid: true });
  });
  it('fora do limite ou ilegível: cartão com o campo editável e o padrão (sem erro técnico)', () => {
    for (const bad of ['ml=49', 'ml=2001', 'ml=abc', 'ml=-5', 'ml=1.5', 'ml=', 'ml=200%27', 'ml=99999999']) {
      assert.deepEqual(parseWater(q(bad)), { ml: 200, valid: false }, bad);
    }
  });
});

describe('treino', () => {
  it('tipo, minutos (5 a 480) e intensidade conhecidos', () => {
    assert.deepEqual(parseWorkout(q('tipo=corrida&min=45&int=forte')), { type: 'corrida', min: 45, intensity: 'forte', valid: true });
    assert.deepEqual(parseWorkout(q('tipo=musculacao&min=5&int=leve')).valid, true);
    assert.deepEqual(parseWorkout(q('min=480')).valid, true);
  });
  it('sem parâmetros usa os padrões; inválidos caem nos padrões e marcam valid=false', () => {
    assert.deepEqual(parseWorkout(q('')), { type: 'musculacao', min: 60, intensity: 'moderada', valid: true });
    for (const bad of ['tipo=natacao', 'min=4', 'min=481', 'min=x', 'int=insana']) assert.equal(parseWorkout(q(bad)).valid, false, bad);
    const r = parseWorkout(q('tipo=natacao&min=9999&int=insana'));
    assert.deepEqual([r.type, r.min, r.intensity], ['musculacao', 60, 'moderada']);
  });
});

describe('refeição e jejum', () => {
  it('modos conhecidos', () => {
    assert.equal(parseMealMode(q('modo=voz')), 'voz');
    assert.equal(parseMealMode(q('modo=foto')), 'foto');
    assert.equal(parseMealMode(q('modo=busca')), 'busca');
    assert.equal(parseMealMode(q('modo=outro')), null);
    assert.equal(parseMealMode(q('')), null);
  });
  it('jejum de 12 a 20 h', () => {
    assert.deepEqual(parseFast(q('h=16')), { hours: 16, valid: true });
    assert.deepEqual(parseFast(q('h=11')), { hours: 16, valid: false });
    assert.deepEqual(parseFast(q('h=21')), { hours: 16, valid: false });
    assert.deepEqual(parseFast(q('')), { hours: 16, valid: true });
  });
});

describe('links dos atalhos', () => {
  it('montam as URLs com os valores escolhidos', () => {
    const d = { ...SHORTCUT_DEFAULTS, waterMl: 300, workoutType: 'corrida', workoutMin: 40, workoutInt: 'forte' };
    assert.equal(QUICK_PATHS.agua(d), '/rapido/agua?ml=300');
    assert.equal(QUICK_PATHS.treino(d), '/rapido/treino?tipo=corrida&min=40&int=forte');
    assert.equal(QUICK_PATHS.refeicaoVoz(), '/rapido/refeicao?modo=voz');
    assert.equal(QUICK_PATHS.peso(), '/rapido/peso');
  });
});

describe('retorno depois do login: SOMENTE caminhos internos /rapido/', () => {
  it('aceita /rapido/ com query', () => {
    assert.equal(safeReturnPath('/rapido/agua?ml=200'), '/rapido/agua?ml=200');
    assert.equal(safeReturnPath('/rapido/peso'), '/rapido/peso');
  });
  it('recusa URLs externas, protocolo, //host, barra invertida e outros caminhos', () => {
    for (const bad of [
      'https://evil.com/rapido/agua', '//evil.com/rapido/agua', '/\\evil.com', 'javascript:alert(1)', '/profile', '/', '/rapido', '/rapido/../profile',
      '/rapidox/agua', 'rapido/agua', '', null, undefined, '/rapido/agua\n', '/rapido//evil.com/x',
    ]) {
      assert.equal(safeReturnPath(bad), bad === '/rapido//evil.com/x' ? '/rapido//evil.com/x' : null, String(bad));
    }
  });
  it('guarda e consome uma vez; valor adulterado no storage não passa', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    storeReturnPath('https://evil.com', storage);
    assert.equal(mem.size, 0);
    storeReturnPath('/rapido/agua?ml=250', storage);
    assert.equal(takeReturnPath(storage), '/rapido/agua?ml=250');
    assert.equal(takeReturnPath(storage), null);
    mem.set(RETURN_KEY, 'https://evil.com');
    assert.equal(takeReturnPath(storage), null);
  });
});

describe('valores padrão do aparelho', () => {
  const storage = (v) => ({ getItem: () => v });
  it('lê os salvos e corrige campo a campo o que estiver fora do limite', () => {
    assert.deepEqual(readDefaults(storage(JSON.stringify({ waterMl: 300, workoutMin: 9999, workoutType: 'bike' }))), {
      ...SHORTCUT_DEFAULTS, waterMl: 300, workoutType: 'bike',
    });
    assert.deepEqual(readDefaults(storage('lixo')), SHORTCUT_DEFAULTS);
    assert.deepEqual(readDefaults(undefined), SHORTCUT_DEFAULTS);
  });
});

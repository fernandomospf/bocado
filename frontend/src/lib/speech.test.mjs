// Registro por voz: sessão de escuta com um SpeechRecognition simulado. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSpeechSession, errorKindOf, getRecognitionCtor, SILENCE_MS } from './speech.ts';

class FakeRecognition {
  static last;
  stopped = 0;
  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.stopped++;
    this.onend?.();
  }
  say(parts, resultIndex = 0) {
    this.onresult?.({ resultIndex, results: parts.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })) });
  }
}

/** Relógio simulado: guarda o último timer e o dispara na mão. */
function fakeTimers() {
  const t = { pending: null, ms: 0, cleared: 0 };
  return Object.assign(t, {
    set: (fn, ms) => {
      t.pending = fn;
      t.ms = ms;
      return fn;
    },
    clear: () => {
      t.pending = null;
      t.cleared++;
    },
  });
}

function run() {
  const events = { partials: [], results: [], errors: [], ends: 0 };
  const timers = fakeTimers();
  const s = createSpeechSession(
    FakeRecognition,
    {
      onPartial: (t) => events.partials.push(t),
      onResult: (t) => events.results.push(t),
      onError: (k) => events.errors.push(k),
      onEnd: () => events.ends++,
    },
    { timers },
  );
  s.start();
  return { s, events, timers, rec: FakeRecognition.last };
}

describe('sessão de voz', () => {
  it('sucesso: o texto parcial aparece e o final chega uma vez, em pt-BR', () => {
    const { events, rec, s } = run();
    assert.equal(rec.lang, 'pt-BR');
    assert.equal(rec.interimResults, true);
    assert.equal(rec.continuous, false);
    rec.say([['dois ovos', false]]);
    rec.say([['dois ovos mexidos', true]]);
    s.stop();
    assert.deepEqual(events.partials, ['dois ovos', 'dois ovos mexidos']);
    assert.deepEqual(events.results, ['dois ovos mexidos']);
    assert.equal(events.ends, 1);
    assert.deepEqual(events.errors, []);
  });

  it('silêncio: para sozinho depois de 2 s sem novas palavras', () => {
    const { events, timers, rec } = run();
    rec.say([['arroz e feijão', false]]);
    assert.equal(timers.ms, SILENCE_MS);
    assert.equal(SILENCE_MS, 2000);
    timers.pending(); // passaram 2 s
    assert.equal(rec.stopped, 1);
    assert.deepEqual(events.results, ['arroz e feijão']);
  });

  it('nova fala reinicia a contagem do silêncio', () => {
    const { timers, rec } = run();
    rec.say([['arroz', false]]);
    rec.say([['arroz e feijão', false]]);
    assert.ok(timers.cleared >= 1);
    assert.equal(rec.stopped, 0);
  });

  it('sem permissão: erro "denied" e nenhum resultado', () => {
    const { events, rec } = run();
    rec.onerror({ error: 'not-allowed' });
    rec.onend();
    assert.deepEqual(events.errors, ['denied']);
    assert.deepEqual(events.results, []);
    assert.equal(events.ends, 1);
  });

  it('sem fala: termina sem texto e avisa "no-speech" (uma vez só)', () => {
    const { events, rec } = run();
    rec.onerror({ error: 'no-speech' });
    rec.onend();
    assert.deepEqual(events.errors, ['no-speech']);

    const second = run();
    second.rec.onend(); // acabou sem erro e sem texto
    assert.deepEqual(second.events.errors, ['no-speech']);
  });

  it('mapeia os códigos de erro do navegador', () => {
    assert.equal(errorKindOf('not-allowed'), 'denied');
    assert.equal(errorKindOf('service-not-allowed'), 'denied');
    assert.equal(errorKindOf('no-speech'), 'no-speech');
    assert.equal(errorKindOf('network'), 'other');
    assert.equal(errorKindOf(undefined), 'other');
  });
});

describe('suporte do navegador (o botão só existe com suporte)', () => {
  it('sem SpeechRecognition nem webkitSpeechRecognition: null', () => {
    assert.equal(getRecognitionCtor({}), null);
    assert.equal(getRecognitionCtor(undefined), null);
  });
  it('aceita o prefixo webkit e a versão padrão', () => {
    assert.equal(getRecognitionCtor({ webkitSpeechRecognition: FakeRecognition }), FakeRecognition);
    assert.equal(getRecognitionCtor({ SpeechRecognition: FakeRecognition }), FakeRecognition);
  });
});

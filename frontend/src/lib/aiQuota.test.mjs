// Cota de IA no app: mensagens, dica e leitura do 429. Roda com: npm test
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { aiBlockMessage, aiBlockReason, aiLeft, aiQuotaError, quotaHintText, showQuotaHint } from './aiQuota.ts';

const day = '2026-11-17T03:00:00.000Z';
const quota = (over = {}) => ({
  features: {
    PHOTO: { used: 3, limit: 8, resetsAt: day },
    TEXT: { used: 0, limit: 15, resetsAt: day },
    LABEL: { used: 4, limit: 4, resetsAt: day },
    SUGGEST: { used: 1, limit: 3, resetsAt: day },
  },
  monthly: { used: 20, limit: 200, resetsAt: '2026-12-01T03:00:00.000Z' },
  paused: false,
  ...over,
});

describe('aiLeft e bloqueio', () => {
  it('restam = limite - usado, limitado pelo mês', () => {
    assert.equal(aiLeft(quota(), 'PHOTO'), 5);
    assert.equal(aiLeft(quota({ monthly: { used: 198, limit: 200, resetsAt: day } }), 'PHOTO'), 2);
    assert.equal(aiLeft(undefined, 'PHOTO'), null);
  });
  it('motivo do bloqueio: diário, mensal, pausa e conta bloqueada', () => {
    assert.equal(aiBlockReason(quota(), 'LABEL'), 'daily');
    assert.equal(aiBlockReason(quota(), 'PHOTO'), null);
    assert.equal(aiBlockReason(quota({ monthly: { used: 200, limit: 200, resetsAt: day } }), 'TEXT'), 'monthly');
    assert.equal(aiBlockReason(quota({ paused: true }), 'TEXT'), 'paused');
    const blocked = quota();
    blocked.features.TEXT.limit = 0;
    assert.equal(aiBlockReason(blocked, 'TEXT'), 'blocked');
  });
});

describe('mensagens (mesma redação do servidor)', () => {
  it('diário: cita o limite e quando volta, com alternativas', () => {
    const m = aiBlockMessage(quota(), 'LABEL');
    assert.match(m, /^Você usou as 4 leituras de rótulo de hoje\. Elas voltam amanhã às \d{2}:\d{2}\. Enquanto isso, dá para buscar o produto ou digitar os valores\.$/);
  });
  it('pausa do beta', () => {
    assert.equal(
      aiBlockMessage(quota({ paused: true }), 'PHOTO'),
      'A análise por IA está em pausa por enquanto no beta. Você continua podendo registrar por busca, código de barras ou manual.',
    );
  });
  it('sem bloqueio, nenhuma mensagem', () => {
    assert.equal(aiBlockMessage(quota(), 'PHOTO'), null);
  });
  it('nunca usa tom de culpa', () => {
    for (const f of ['PHOTO', 'LABEL', 'SUGGEST']) {
      const q = quota({ paused: f === 'PHOTO' });
      q.features.SUGGEST.used = 3;
      const m = aiBlockMessage(q, f) ?? '';
      assert.doesNotMatch(m, /exagerou|abusou|passou do limite|estourou|culpa/i);
    }
  });
});

describe('dica "Restam N"', () => {
  it('só aparece com 3 ou menos, ou 30% do limite; singular e plural', () => {
    assert.equal(showQuotaHint(quota(), 'PHOTO'), null); // 5 de 8
    assert.deepEqual(showQuotaHint(quota(), 'SUGGEST'), { left: 2 });
    const q = quota();
    q.features.PHOTO.used = 6;
    assert.deepEqual(showQuotaHint(q, 'PHOTO'), { left: 2 });
    q.features.TEXT.used = 11; // 4 de 15 = 26%
    assert.deepEqual(showQuotaHint(q, 'TEXT'), { left: 4 });
    assert.equal(showQuotaHint(quota(), 'LABEL'), null); // zerada: o aviso é de bloqueio, não de dica
    assert.equal(showQuotaHint(quota({ paused: true }), 'PHOTO'), null);
    assert.equal(quotaHintText(1, 'PHOTO'), 'Resta 1 análise por foto hoje');
    assert.equal(quotaHintText(3, 'PHOTO'), 'Restam 3 análises por foto hoje');
  });
});

describe('aiQuotaError (429 do servidor)', () => {
  const apiError = (status, data) => Object.assign(new Error(data?.message ?? 'x'), { name: 'ApiError', status, data });
  it('reconhece o 429 de cota pelo código AI_*', () => {
    const body = { code: 'AI_QUOTA_DAILY', message: 'Você usou as 8 análises por foto de hoje.', feature: 'PHOTO', limit: 8, used: 8, resetsAt: day };
    assert.deepEqual(aiQuotaError(apiError(429, body)), body);
  });
  it('429 comum (rate limit por minuto), outros status e erros quaisquer não são cota', () => {
    assert.equal(aiQuotaError(apiError(429, { message: 'Muitas análises seguidas. Aguarde um minuto.' })), null);
    assert.equal(aiQuotaError(apiError(503, { code: 'AI_BLOCKED', message: 'x' })), null);
    assert.equal(aiQuotaError(new Error('rede')), null);
    assert.equal(aiQuotaError(null), null);
  });
});

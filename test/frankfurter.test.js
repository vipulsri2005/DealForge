import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchUsdRate } from '../src/providers/frankfurter.js';

test('USD conversion uses a live Frankfurter v2 currency pair', async () => {
  let requestedUrl;
  const result = await fetchUsdRate('INR', async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ base: 'USD', quote: 'INR', rate: 83.5, date: '2026-10-14' }) };
  });
  assert.equal(requestedUrl, 'https://api.frankfurter.dev/v2/rate/usd/inr');
  assert.deepEqual(result, { rate: 83.5, date: '2026-10-14' });
});

test('USD rate does not make a network request', async () => {
  const result = await fetchUsdRate('usd', () => { throw new Error('unexpected network request'); });
  assert.deepEqual(result, { rate: 1, date: null });
});

test('invalid rates and failed requests are rejected', async () => {
  await assert.rejects(fetchUsdRate('INR', async () => ({ ok: true, json: async () => ({ quote: 'INR', rate: 0 }) })));
  await assert.rejects(fetchUsdRate('INR', async () => ({ ok: false, status: 503 })));
  await assert.rejects(fetchUsdRate('../USD', async () => { throw new Error('should not fetch'); }));
});

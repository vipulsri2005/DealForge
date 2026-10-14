import test from 'node:test';
import assert from 'node:assert/strict';
import { searchGames, getGameDetails, providerCapabilities } from '../src/providers/cheapshark.js';

test('searchGames normalizes a real-provider-shaped result and requests title search', async () => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    return Response.json([{ gameID: '42', external: 'Example Game', steamAppID: '123', thumb: 'https://example.test/art.jpg', cheapest: '5.00', cheapestDealID: 'deal' }]);
  };
  try {
    const games = await searchGames(' Example Game ');
    assert.equal(requested.searchParams.get('title'), 'Example Game');
    assert.equal(games[0].id, 'cheapshark:42');
    assert.equal(games[0].cheapest, 5);
    assert.equal(games[0].source, 'CheapShark');
  } finally { globalThis.fetch = originalFetch; }
});

test('searchGames supports Steam App ID lookup without a title', async () => {
  const originalFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => { requested = new URL(url); return Response.json([]); };
  try {
    assert.deepEqual(await searchGames('', '123'), []);
    assert.equal(requested.searchParams.get('steamAppID'), '123');
    assert.equal(requested.searchParams.has('title'), false);
  } finally { globalThis.fetch = originalFetch; }
});

test('getGameDetails sorts normalized USD offers and reports provider limitations', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith('/stores')) return Response.json([{ storeID: '1', storeName: 'Example Store' }]);
    return Response.json({ info: { title: 'Example Game' }, cheapestPriceEver: { price: '2.50', date: 1700000000 }, deals: [
      { storeID: '1', dealID: 'later', price: '8.00', retailPrice: '10.00', savings: '20', lastChange: '1700000000' },
      { storeID: '1', dealID: 'best', price: '4.00', retailPrice: '10.00', savings: '60', lastChange: '1700000000' }
    ] });
  };
  try {
    const game = await getGameDetails('42');
    assert.equal(game.offers[0].price, 4);
    assert.equal(game.offers[0].store, 'Example Store');
    assert.equal(game.offers[0].currency, 'USD');
    assert.equal(game.cheapestEver.price, 2.5);
    assert.equal(providerCapabilities.getPriceHistory, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('provider errors surface a rate-limit message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 429 });
  try { await assert.rejects(() => searchGames('Example'), /rate limit/i); }
  finally { globalThis.fetch = originalFetch; }
});

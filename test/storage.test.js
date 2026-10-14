import test from 'node:test';
import assert from 'node:assert/strict';
import { readState, saveWishlistItem } from '../src/storage.js';

class MemoryStorage {
  getItem(key) { return this[key] ?? null; }
  setItem(key, value) { this[key] = value; }
}

test('wishlist storage survives reads and updates a matching canonical provider ID', async () => {
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = new MemoryStorage();
  try {
    const game = { id: 'cheapshark:42', providerId: '42', title: 'Example Game', artwork: null };
    await saveWishlistItem(game);
    await saveWishlistItem(game, '12.50');
    const state = await readState();
    assert.equal(state.wishlist.length, 1);
    assert.equal(state.wishlist[0].targetPrice, 12.5);
    assert.equal(state.wishlist[0].alertEnabled, true);
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

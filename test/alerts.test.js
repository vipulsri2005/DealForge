import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateTargetAlert } from '../src/alerts.js';

const item = { providerId: '42', targetPrice: 10, alertEnabled: true };

test('eligible USD offer crosses the configured threshold once', () => {
  const offers = [{ dealId: 'deal-1', price: 8.5 }];
  const first = evaluateTargetAlert({ item, offers, preferredRegion: 'US' });
  assert.equal(first.shouldNotify, true);
  assert.equal(first.offerKey, 'deal-1:8.5');
  const repeat = evaluateTargetAlert({ item, offers, previousOfferKey: first.offerKey, preferredRegion: 'US' });
  assert.equal(repeat.shouldNotify, false);
});

test('a changed price is a new event and a price above target re-arms the alert', () => {
  const updated = evaluateTargetAlert({ item, offers: [{ dealId: 'deal-1', price: 7.5 }], previousOfferKey: 'deal-1:8.5' });
  assert.equal(updated.shouldNotify, true);
  const above = evaluateTargetAlert({ item, offers: [{ dealId: 'deal-1', price: 11 }], previousOfferKey: updated.offerKey });
  assert.equal(above.rearmed, true);
});

test('non-US preferences do not generate notifications from offers with unknown region', () => {
  const result = evaluateTargetAlert({ item, offers: [{ dealId: 'deal-1', price: 1 }], preferredRegion: 'IN' });
  assert.equal(result.eligible, null);
  assert.equal(result.shouldNotify, false);
});

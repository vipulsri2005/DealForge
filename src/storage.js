const DEFAULTS = { wishlist: [], settings: { currency: 'USD', region: 'US', retailerScope: 'all' }, notifiedOffers: {}, pendingSearch: null, detectedContext: null };

export async function readState() {
  if (globalThis.chrome?.storage?.local) return chrome.storage.local.get(DEFAULTS);
  const stored = JSON.parse(localStorage.getItem('dealforge-state') || '{}');
  return { ...DEFAULTS, ...stored, settings: { ...DEFAULTS.settings, ...(stored.settings || {}) } };
}

export async function writeState(patch) {
  if (globalThis.chrome?.storage?.local) return chrome.storage.local.set(patch);
  const current = await readState();
  localStorage.setItem('dealforge-state', JSON.stringify({ ...current, ...patch }));
}

export async function saveWishlistItem(game, targetPrice = null) {
  const state = await readState();
  const existing = state.wishlist.find((item) => item.id === game.id);
  const entry = {
    id: game.id, providerId: game.providerId, title: game.title,
    artwork: game.artwork, steamAppId: game.steamAppId || null,
    targetPrice: targetPrice === '' ? null : targetPrice == null ? (existing?.targetPrice ?? null) : Number(targetPrice),
    alertEnabled: targetPrice === '' ? (existing?.alertEnabled ?? false) : targetPrice != null,
    lastChecked: new Date().toISOString(), savedAt: existing?.savedAt || new Date().toISOString(),
    ...(existing?.offer ? { offer: existing.offer } : {})
  };
  const wishlist = existing ? state.wishlist.map((item) => item.id === game.id ? entry : item) : [...state.wishlist, entry];
  await writeState({ wishlist });
  return entry;
}

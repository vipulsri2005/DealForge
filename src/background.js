import { getGameDetails, searchGames } from './providers/cheapshark.js';
import { evaluateTargetAlert } from './alerts.js';
import { saveWishlistItem } from './storage.js';
import { fetchUsdRate } from './providers/frankfurter.js';

const ALARM = 'dealforge-price-check';
chrome.runtime.onInstalled.addListener(() => chrome.alarms.create(ALARM, { periodInMinutes: 360 }));
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === ALARM) checkAlerts(); });
chrome.runtime.onStartup.addListener(checkAlerts);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'DEALFORGE_ALERT_CHECK') checkAlerts().then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
  if (message.type === 'DEALFORGE_DETECT_GAME') {
    searchGames(message.query, message.steamAppId || null).then(async (games) => {
      const detectedContext = { query: message.query || '', steamAppId: message.steamAppId || null, games, pageUrl: _sender.url || '', createdAt: Date.now() };
      await chrome.storage.local.set({ pendingSearch: detectedContext, detectedContext });
      sendResponse({ ok: true, games });
    }).catch((error) => sendResponse({ ok: false, error: error.message }));
  }
  if (message.type === 'DEALFORGE_GAME_OFFERS') {
    getGameDetails(message.providerId).then((game) => sendResponse({ ok: true, game })).catch((error) => sendResponse({ ok: false, error: error.message }));
  }
  if (message.type === 'DEALFORGE_SAVE_GAME') {
    saveWishlistItem(message.game).then(() => sendResponse({ ok: true })).catch((error) => sendResponse({ ok: false, error: error.message }));
  }
  if (message.type === 'DEALFORGE_GET_RATE') {
    getCachedRate(message.currency).then((rate) => sendResponse({ ok: true, ...rate }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
  }
  if (message.type === 'DEALFORGE_OPEN_SEARCH') {
    chrome.storage.local.set({ pendingSearch: { query: message.query || '', steamAppId: message.steamAppId || null, createdAt: Date.now() } })
      .then(() => chrome.runtime.openOptionsPage()).then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
  }
  return ['DEALFORGE_ALERT_CHECK', 'DEALFORGE_DETECT_GAME', 'DEALFORGE_GAME_OFFERS', 'DEALFORGE_SAVE_GAME', 'DEALFORGE_GET_RATE', 'DEALFORGE_OPEN_SEARCH'].includes(message.type);
});

async function getCachedRate(currency) {
  const code = String(currency || '').toUpperCase();
  if (code === 'USD') return { rate: 1, date: null };
  const key = `dealforge_fx_${code}`;
  const stored = (await chrome.storage.local.get(key))[key];
  if (stored && Date.now() - stored.fetchedAt < 24 * 60 * 60 * 1000) return stored;
  try {
    const result = await fetchUsdRate(code);
    const value = { ...result, fetchedAt: Date.now() };
    await chrome.storage.local.set({ [key]: value });
    return value;
  } catch (error) {
    if (stored && Date.now() - stored.fetchedAt < 7 * 24 * 60 * 60 * 1000) return { ...stored, stale: true };
    throw error;
  }
}

async function checkAlerts() {
  const { wishlist = [], notifiedOffers = {}, settings = { region: 'US' } } = await chrome.storage.local.get({ wishlist: [], notifiedOffers: {}, settings: { region: 'US' } });
  let changed = false;
  for (const item of wishlist) {
    if (!item.alertEnabled || !Number.isFinite(Number(item.targetPrice)) || !item.providerId || (settings.region && settings.region !== 'US')) continue;
    try {
      const game = await getGameDetails(item.providerId);
      const previous = notifiedOffers[item.id];
      const evaluation = evaluateTargetAlert({ item, offers: game.offers, previousOfferKey: previous, preferredRegion: settings.region || 'US' });
      const eligible = evaluation.eligible;
      if (evaluation.shouldNotify) {
        const permission = await chrome.notifications.getPermissionLevel();
        if (permission === 'granted') {
          await chrome.notifications.create(`dealforge-${item.id}-${Date.now()}`, {
            type: 'basic', iconUrl: 'icons/icon.png', title: `${item.title} hit your target`,
            message: `${eligible.store}: $${eligible.price.toFixed(2)} (target $${Number(item.targetPrice).toFixed(2)})`
          });
          notifiedOffers[item.id] = evaluation.offerKey;
          changed = true;
        }
        item.offer = { price: eligible.price, store: eligible.store, dealId: eligible.dealId, checkedAt: game.checkedAt };
        changed = true;
      } else if (evaluation.rearmed) {
        delete notifiedOffers[item.id];
        changed = true;
      }
      item.lastChecked = new Date().toISOString();
      changed = true;
      item.regionNotice = settings.region && settings.region !== 'US' ? 'Provider does not confirm offer availability for the selected region.' : 'Provider does not report offer region; verify availability with the store.';
    } catch { /* A provider outage must not invalidate other saved items. */ }
  }
  if (changed) await chrome.storage.local.set({ wishlist, notifiedOffers });
}

import { readState, writeState, saveWishlistItem } from './storage.js';
import { getGameDetails, searchGames } from './providers/cheapshark.js';

const currencies = ['USD','INR','EUR','GBP','JPY','CAD','AUD','CHF','CNY','KRW','BRL','MXN','NZD','SGD','ZAR'];
const regions = { US: 'United States', IN: 'India', GB: 'United Kingdom', CA: 'Canada', AU: 'Australia', EU: 'Europe' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let state;
let gamesWithOffers = {};
let searchMatches = [];
let pendingSteamId = null;

function formattedPrice(value, currency = 'USD') {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(value)); }
  catch { return `${currency} ${Number(value).toFixed(2)}`; }
}

function render() {
  const query = document.querySelector('#filter').value.toLowerCase();
  const sort = document.querySelector('#sort').value;
  let items = state.wishlist.filter((item) => item.title.toLowerCase().includes(query));
  items.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'price' ? Number(a.offer?.price ?? Infinity) - Number(b.offer?.price ?? Infinity) : sort === 'discount' ? Number(b.offer?.discountPercent || 0) - Number(a.offer?.discountPercent || 0) : new Date(b.savedAt) - new Date(a.savedAt));
  const grid = document.querySelector('#wishlist');
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">⌕</div><h2>${state.wishlist.length ? 'No matching games' : 'Your wishlist starts here'}</h2><p>${state.wishlist.length ? 'Try a different search.' : 'Search a PC game in the extension popup and add it here to track its price.'}</p><button id="search-from-empty" class="primary">Open game search</button></div>`;
    document.querySelector('#search-from-empty').addEventListener('click', () => window.open(chrome.runtime.getURL('popup.html'), '_blank'));
    return;
  }
  grid.innerHTML = items.map((item) => {
    const offer = item.offer;
    const artwork = item.artwork ? `<img src="${esc(item.artwork)}" alt="${esc(item.title)} artwork">` : '<span>DF</span>';
    return `<article class="wishlist-card"><div class="card-art">${artwork}</div><div class="card-body"><div class="card-title-row"><h2>${esc(item.title)}</h2><button class="icon-button remove" data-remove="${esc(item.id)}" aria-label="Remove ${esc(item.title)}">×</button></div><p class="price-line">${offer ? formattedPrice(offer.price, offer.currency || 'USD') : 'No current offer'} <small>${offer ? `at ${esc(offer.store)}` : 'Live check when available'}</small></p><div class="target-row"><label>Alert below <span class="target-input-wrap"><span>$</span><input data-target="${esc(item.id)}" type="number" min="0" step="0.01" placeholder="No target" value="${item.targetPrice ?? ''}"></span></label><label class="switch"><input type="checkbox" data-alert="${esc(item.id)}" ${item.alertEnabled ? 'checked' : ''}><span>Alert on</span></label></div><div class="card-meta"><span>${item.alertEnabled ? 'Target alert enabled' : 'Alert paused'}</span><span>Checked ${item.lastChecked ? new Date(item.lastChecked).toLocaleDateString() : 'not yet'}</span></div><button class="secondary refresh" data-refresh="${esc(item.id)}">Check current offers</button></div></article>`;
  }).join('');
  grid.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => updateWishlist(state.wishlist.filter((item) => item.id !== button.dataset.remove))));
  grid.querySelectorAll('[data-target]').forEach((input) => input.addEventListener('change', async () => {
    const item = state.wishlist.find((candidate) => candidate.id === input.dataset.target);
    item.targetPrice = input.value === '' ? null : Number(input.value);
    if (item.targetPrice == null) item.alertEnabled = false;
    await persist();
  }));
  grid.querySelectorAll('[data-alert]').forEach((input) => input.addEventListener('change', async () => {
    const item = state.wishlist.find((candidate) => candidate.id === input.dataset.alert);
    if (input.checked && item.targetPrice == null) { input.checked = false; document.querySelector('#dashboard-status').textContent = 'Set a target price before enabling an alert.'; return; }
    item.alertEnabled = input.checked; await persist();
  }));
  grid.querySelectorAll('[data-refresh]').forEach((button) => button.addEventListener('click', () => refreshItem(button.dataset.refresh, button)));
}

async function persist() { await writeState({ wishlist: state.wishlist }); render(); }
async function updateWishlist(wishlist) { state.wishlist = wishlist; await persist(); }

async function refreshItem(id, button) {
  const item = state.wishlist.find((candidate) => candidate.id === id);
  if (!item?.providerId) { document.querySelector('#dashboard-status').textContent = 'This is demo-only content; live offers require a CheapShark result.'; return; }
  button.disabled = true; button.textContent = 'Checking…';
  try {
    const details = await getGameDetails(item.providerId);
    item.offer = details.offers[0] ? { ...details.offers[0] } : null;
    item.lastChecked = details.checkedAt;
    gamesWithOffers[id] = details;
    await persist();
    document.querySelector('#dashboard-status').textContent = details.offers.length ? `Updated ${item.title}. The lowest listed offer is ${formattedPrice(item.offer.price)} at ${item.offer.store}.` : `No current offers returned for ${item.title}.`;
  } catch (error) { document.querySelector('#dashboard-status').textContent = error.message || 'Price provider is unavailable.'; }
  finally { button.disabled = false; button.textContent = 'Check current offers'; }
}

document.querySelector('#dashboard-search').addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = document.querySelector('#dashboard-search-input').value.trim();
  if (!query && !pendingSteamId) return;
  const output = document.querySelector('#search-results');
  output.innerHTML = '<div class="loading-line">Searching CheapShark…</div>';
  try {
    searchMatches = await searchGames(query, pendingSteamId);
    pendingSteamId = null;
    if (!searchMatches.length) { output.innerHTML = '<div class="loading-line">No game matches found.</div>'; return; }
    output.innerHTML = searchMatches.map((game) => `<article class="result-card"><div class="game-thumb">${game.artwork ? `<img src="${esc(game.artwork)}" alt="">` : '<span>DF</span>'}</div><div class="result-copy"><strong>${esc(game.title)}</strong><small>CheapShark · lowest listed ${formattedPrice(game.cheapest)}</small></div><button class="add-button" data-search-add="${esc(game.id)}">＋</button><button class="details-button" data-search-details="${esc(game.id)}">Offers</button></article>`).join('');
    output.querySelectorAll('[data-search-add]').forEach((button) => button.addEventListener('click', async () => { await saveWishlistItem(searchMatches.find((game) => game.id === button.dataset.searchAdd)); state = await readState(); render(); button.textContent = '✓'; button.disabled = true; }));
    output.querySelectorAll('[data-search-details]').forEach((button) => button.addEventListener('click', async () => {
      const game = searchMatches.find((candidate) => candidate.id === button.dataset.searchDetails);
      button.textContent = '…'; button.disabled = true;
      try {
        const details = await getGameDetails(game.providerId);
        output.innerHTML = `<div class="offer-head"><button class="quiet" id="return-to-search">← Results</button><strong>${esc(details.title)}</strong></div>${details.offers.length ? details.offers.slice(0, 8).map((offer) => `<article class="result-card"><div class="result-copy"><strong>${esc(offer.store)} · ${formattedPrice(offer.price)}</strong><small>${esc(offer.edition)} · region not specified · provider response received ${new Date(details.checkedAt).toLocaleString()}</small></div><a class="buy-link" href="${esc(offer.purchaseUrl)}" target="_blank" rel="noreferrer">Visit store ↗</a></article>`).join('') : '<div class="loading-line">No current offers were returned.</div>'}`;
        document.querySelector('#return-to-search').addEventListener('click', () => document.querySelector('#dashboard-search').requestSubmit());
      } catch (error) { document.querySelector('#dashboard-status').textContent = error.message; button.disabled = false; button.textContent = 'Offers'; }
    }));
  } catch (error) { output.innerHTML = `<div class="loading-line">${esc(error.message || 'Price provider is unavailable.')}</div>`; }
});

const currencySelect = document.querySelector('#currency');
currencySelect.innerHTML = currencies.map((currency) => `<option>${currency}</option>`).join('');
document.querySelector('#region').innerHTML = Object.entries(regions).map(([code, label]) => `<option value="${code}">${label}</option>`).join('');
state = await readState();
currencySelect.value = currencies.includes(state.settings.currency) ? state.settings.currency : 'USD';
document.querySelector('#region').value = regions[state.settings.region] ? state.settings.region : 'US';
document.querySelector('#filter').addEventListener('input', render);
document.querySelector('#sort').addEventListener('change', render);
currencySelect.addEventListener('change', async () => { state.settings.currency = currencySelect.value; await writeState({ settings: state.settings }); document.querySelector('#dashboard-status').textContent = 'Preference saved. Live prices remain in their provider-reported currency until currency conversion is configured.'; });
document.querySelector('#region').addEventListener('change', async (event) => { state.settings.region = event.target.value; await writeState({ settings: state.settings }); document.querySelector('#dashboard-status').textContent = 'Preferred region saved. Automatic alerts pause outside the United States because the provider does not report regional availability.'; });
document.querySelector('#export-wishlist').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), wishlist: state.wishlist, settings: state.settings }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'dealforge-wishlist.json'; link.click(); URL.revokeObjectURL(url);
});
render();
const notificationPermission = await chrome.notifications.getPermissionLevel();
if (notificationPermission !== 'granted') document.querySelector('#dashboard-status').textContent = 'Browser notifications are not currently permitted. Price alerts will not show a notification until Chrome grants this extension permission.';
if (state.pendingSearch && Date.now() - state.pendingSearch.createdAt < 300000) {
  const pending = state.pendingSearch;
  await writeState({ pendingSearch: null });
  document.querySelector('#dashboard-search-input').value = pending.query || '';
  pendingSteamId = pending.steamAppId || null;
  document.querySelector('#dashboard-search').requestSubmit();
}

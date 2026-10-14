import { searchGames, getGameDetails } from './providers/cheapshark.js';
import { readState, saveWishlistItem, writeState } from './storage.js';

const form = document.querySelector('#search-form');
const input = document.querySelector('#search-input');
const results = document.querySelector('#results');
const status = document.querySelector('#status');
const demoGames = [
  { id: 'demo:hollow-knight', providerId: null, title: 'Hollow Knight', artwork: null, cheapest: 7.49, source: 'DEMO DATA' },
  { id: 'demo:celeste', providerId: null, title: 'Celeste', artwork: null, cheapest: 4.99, source: 'DEMO DATA' },
  { id: 'demo:stardew-valley', providerId: null, title: 'Stardew Valley', artwork: null, cheapest: 8.99, source: 'DEMO DATA' }
];

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value);

async function updateCount() {
  const state = await readState();
  document.querySelector('#wishlist-count').textContent = state.wishlist.length;
}

function renderGames(games) {
  results.innerHTML = games.map((game) => `<article class="result-card"><div class="game-thumb">${game.artwork ? `<img src="${esc(game.artwork)}" alt="">` : '<span>DF</span>'}</div><div class="result-copy"><strong>${esc(game.title)}</strong><small>${esc(game.source)} · lowest listed ${money(game.cheapest)}</small></div><button class="add-button" data-add="${esc(game.id)}">＋</button><button class="details-button" data-details="${esc(game.id)}">Offers</button></article>`).join('');
  results.querySelectorAll('[data-add]').forEach((button) => button.addEventListener('click', async () => {
    const game = games.find((candidate) => candidate.id === button.dataset.add);
    await saveWishlistItem(game);
    button.textContent = '✓'; button.disabled = true;
    status.textContent = `${game.title} saved to your wishlist.`;
    updateCount();
  }));
  results.querySelectorAll('[data-details]').forEach((button) => button.addEventListener('click', () => showOffers(games.find((candidate) => candidate.id === button.dataset.details))));
}

async function showOffers(game) {
  if (!game.providerId) { status.textContent = `${game.title} is demo data; live offers are unavailable in demo mode.`; return; }
  status.textContent = `Loading current offers for ${game.title}…`;
  try {
    const details = await getGameDetails(game.providerId);
    if (!details.offers.length) { status.textContent = 'No current offers were returned by the provider.'; return; }
    results.innerHTML = `<div class="offer-head"><button id="back-results" class="quiet">← Results</button><strong>${esc(details.title)}</strong></div>${details.offers.slice(0, 5).map((offer) => `<article class="result-card offer-card"><div class="result-copy"><strong>${esc(offer.store)}</strong><small>${esc(offer.edition)} · ${esc(offer.region)} · provider response received ${new Date(details.checkedAt).toLocaleString()}</small></div><div class="offer-price">${money(offer.price)}${offer.discountPercent ? `<small>−${Math.round(offer.discountPercent)}%</small>` : ''}</div><a class="buy-link" href="${esc(offer.purchaseUrl)}" target="_blank" rel="noreferrer">Visit store ↗</a></article>`).join('')}`;
    document.querySelector('#back-results').addEventListener('click', () => renderGames(window.currentGames || []));
    status.textContent = 'Prices are provider-listed USD prices. Confirm the offer and regional availability with the retailer before buying.';
  } catch (error) { status.textContent = error.message || 'The provider is unavailable right now.'; }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  const isDemo = document.querySelector('#demo-mode').checked;
  status.textContent = isDemo ? 'Showing clearly labeled demo examples.' : 'Searching CheapShark…';
  results.innerHTML = '<div class="loading-line">Searching PC game offers…</div>';
  try {
    const games = isDemo ? demoGames.filter((game) => game.title.toLowerCase().includes(query.toLowerCase())) : await searchGames(query);
    window.currentGames = games;
    if (!games.length) { results.innerHTML = ''; status.textContent = isDemo ? 'No demo examples match. Turn off demo mode to search live data.' : 'No matching games found.'; return; }
    renderGames(games);
    status.textContent = isDemo ? 'DEMO ONLY — these values are not live prices.' : `Found ${games.length} catalog match${games.length === 1 ? '' : 'es'} from CheapShark.`;
  } catch (error) { results.innerHTML = ''; status.textContent = error.message || 'Could not reach CheapShark. Check your connection and retry.'; }
});

document.querySelector('#open-dashboard').addEventListener('click', () => {
  if (chrome?.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  else location.href = 'dashboard.html';
});
document.querySelector('#show-wishlist').addEventListener('click', () => {
  if (chrome?.tabs) chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#wishlist') });
  else location.href = 'dashboard.html#wishlist';
});
document.querySelector('#demo-mode').addEventListener('change', async (event) => {
  const state = await readState();
  await writeState({ settings: { ...state.settings, demoMode: event.target.checked } });
});
async function initializePopup() {
  const state = await readState();
  document.querySelector('#demo-mode').checked = !!state.settings.demoMode;
  document.querySelector('#wishlist-count').textContent = state.wishlist.length;
  const pending = state.pendingSearch;
  let activeTabUrl = '';
  try { const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true }); activeTabUrl = activeTab?.url || ''; } catch { /* activeTab is available after the extension action is clicked */ }
  const recentPending = pending && Date.now() - pending.createdAt <= 300000 && (!pending.pageUrl || pending.pageUrl === activeTabUrl);
  const rememberedPage = state.detectedContext && Date.now() - state.detectedContext.createdAt <= 86400000 && state.detectedContext.pageUrl === activeTabUrl;
  const context = recentPending ? pending : rememberedPage ? state.detectedContext : null;
  if (!context) return;
  input.value = context.query || '';
  if (recentPending) await writeState({ pendingSearch: null });
  if (Array.isArray(context.games) && context.games.length) {
    window.currentGames = context.games;
    renderGames(context.games);
    status.textContent = `Detected “${context.query || 'Steam game'}” in your browser. Choose a match or compare its offers.`;
  } else if (context.query || context.steamAppId) {
    form.requestSubmit();
  }
}
initializePopup();

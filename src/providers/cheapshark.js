const API = 'https://www.cheapshark.com/api/1.0';
let storeNamesPromise;

async function request(path, params = {}) {
  const url = new URL(`${API}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(response.status === 429 ? 'CheapShark rate limit reached. Try again shortly.' : `Price provider returned ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function searchGames(query, steamAppId = null) {
  const results = await request('games', { title: query?.trim(), steamAppID: steamAppId, limit: 12 });
  return results.map((game) => ({
    id: `cheapshark:${game.gameID}`,
    providerId: game.gameID,
    title: game.external,
    steamAppId: game.steamAppID || null,
    artwork: game.thumb || null,
    cheapest: Number(game.cheapest),
    cheapestDealId: game.cheapestDealID || null,
    source: 'CheapShark',
    observedAt: new Date().toISOString()
  }));
}

export async function getGameDetails(providerId) {
  const game = await request('games', { id: providerId });
  if (!storeNamesPromise) storeNamesPromise = request('stores').then((stores) => new Map(stores.map((store) => [String(store.storeID), store.storeName]))).catch(() => new Map());
  const storeNames = await storeNamesPromise;
  const checkedAt = new Date().toISOString();
  const deals = (game.deals || []).map((deal) => ({
    storeId: deal.storeID,
    dealId: deal.dealID,
    store: deal.storeName || storeNames.get(String(deal.storeID)) || `Store ${deal.storeID}`,
    edition: 'Standard (provider does not specify edition)',
    region: 'Not specified by provider',
    currency: 'USD',
    price: Number(deal.price),
    regularPrice: Number(deal.retailPrice ?? deal.normalPrice),
    discountPercent: Number(deal.savings),
    purchaseUrl: `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(deal.dealID)}`,
    provider: 'CheapShark',
    lastChangeAt: deal.lastChange ? new Date(Number(deal.lastChange) * 1000).toISOString() : null,
    checkedAt
  })).filter((offer) => Number.isFinite(offer.price)).sort((a, b) => a.price - b.price);
  return {
    title: game.info?.title || 'Game',
    artwork: game.info?.thumb || null,
    steamAppId: game.info?.steamAppID || null,
    cheapestEver: game.cheapestPriceEver ? { price: Number(game.cheapestPriceEver.price), observedAt: new Date(Number(game.cheapestPriceEver.date) * 1000).toISOString() } : null,
    offers: deals,
    source: 'CheapShark',
    checkedAt
  };
}

export const providerCapabilities = {
  searchGames: true,
  getGameDetails: true,
  getCurrentOffers: true,
  getRegionalOffers: false,
  getPriceHistory: false,
  note: 'CheapShark provides PC game search, deal listings, and a cheapest-ever point. Regional offer filtering and full historical time series are not exposed by this MVP adapter.'
};

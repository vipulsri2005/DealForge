const API_BASE = 'https://api.frankfurter.dev/v2';

export async function fetchUsdRate(currency, fetchImpl = fetch) {
  const quote = String(currency || '').toUpperCase();
  if (quote === 'USD') return { rate: 1, date: null };
  if (!/^[A-Z]{3}$/.test(quote)) throw new Error('Unsupported currency code.');
  const response = await fetchImpl(`${API_BASE}/rate/usd/${quote.toLowerCase()}`);
  if (!response.ok) throw new Error(`Exchange rate request failed (${response.status}).`);
  const data = await response.json();
  if (!Number.isFinite(data?.rate) || data.rate <= 0 || data.quote !== quote) throw new Error('Exchange rate was unavailable.');
  return { rate: data.rate, date: data.date };
}

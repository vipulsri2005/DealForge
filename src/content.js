(() => {
  const WIDGET_ID = 'dealforge-page-widget';
  let lastProcessedUrl = '';
  let dismissedUrl = '';
  let shadow;
  let currentCurrency = 'USD';
  let currentRate = 1;
  let rateDate = null;
  const currencies = [
    ['USD', '🇺🇸', 'United States Dollar'], ['INR', '🇮🇳', 'Indian Rupee'], ['EUR', '🇪🇺', 'Euro'], ['GBP', '🇬🇧', 'British Pound'],
    ['JPY', '🇯🇵', 'Japanese Yen'], ['CAD', '🇨🇦', 'Canadian Dollar'], ['AUD', '🇦🇺', 'Australian Dollar'], ['CHF', '🇨🇭', 'Swiss Franc'],
    ['CNY', '🇨🇳', 'Chinese Yuan'], ['KRW', '🇰🇷', 'South Korean Won'], ['BRL', '🇧🇷', 'Brazilian Real'], ['MXN', '🇲🇽', 'Mexican Peso'],
    ['NZD', '🇳🇿', 'New Zealand Dollar'], ['SGD', '🇸🇬', 'Singapore Dollar'], ['ZAR', '🇿🇦', 'South African Rand']
  ];

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const price = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currentCurrency }).format(Number(value) * currentRate);
  const priceNode = (value) => `<span class="converted-price" data-usd-price="${Number(value)}"></span>`;

  function refreshPrices() {
    if (!shadow) return;
    shadow.querySelectorAll('[data-usd-price]').forEach((node) => {
      const usd = Number(node.dataset.usdPrice);
      node.textContent = price(usd);
      node.title = currentCurrency === 'USD' ? 'Provider-listed USD' : `Converted estimate; provider-listed price: ${new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(usd)} USD`;
    });
    const footer = shadow.querySelector('.footer');
    if (footer) footer.textContent = currentCurrency === 'USD'
      ? 'Prices are provider-listed USD. Region and edition details may be incomplete; verify before purchase.'
      : `Converted estimate · ${rateDate ? `exchange rate dated ${rateDate}` : 'exchange rate'} · original provider prices are USD. Verify region and edition before purchase.`;
  }

  async function selectCurrency(code) {
    currentCurrency = code;
    currentRate = 1;
    rateDate = null;
    refreshPrices();
    const { settings = {} } = await chrome.storage.local.get({ settings: {} });
    await chrome.storage.local.set({ settings: { ...settings, currency: code } });
    if (code !== 'USD') {
      const footer = shadow?.querySelector('.footer');
      if (footer) footer.textContent = 'Loading exchange rate…';
      try {
        const reply = await chrome.runtime.sendMessage({ type: 'DEALFORGE_GET_RATE', currency: code });
        if (!reply?.ok) throw new Error(reply?.error || 'Exchange rate unavailable');
        currentRate = reply.rate;
        rateDate = reply.date;
        refreshPrices();
      } catch {
        currentCurrency = 'USD'; currentRate = 1; rateDate = null;
        if (footer) footer.textContent = 'Exchange rate unavailable. Prices shown in provider-listed USD.';
        refreshPrices();
      }
    }
    shadow?.querySelector('.currency-menu')?.classList.add('hidden');
    const selector = shadow?.querySelector('.currency-current');
    if (selector) { selector.textContent = currencies.find(([currency]) => currency === currentCurrency)?.[1] || '🇺🇸'; selector.title = currencies.find(([currency]) => currency === currentCurrency)?.[2] || 'United States Dollar'; selector.setAttribute('aria-label', `Display currency: ${currentCurrency}`); }
  }

  async function loadCurrency() {
    const { settings = {} } = await chrome.storage.local.get({ settings: {} });
    const code = currencies.some(([currency]) => currency === settings.currency) ? settings.currency : 'USD';
    await selectCurrency(code);
  }

  function pageGame() {
    const url = new URL(location.href);
    if (url.hostname === 'store.steampowered.com') {
      const steamAppId = url.pathname.match(/\/app\/(\d+)/)?.[1];
      if (steamAppId) {
        const title = document.querySelector('.apphub_AppName')?.textContent?.trim() || document.title.replace(/\s+on Steam.*$/i, '').trim();
        return { query: title, steamAppId, kind: 'store' };
      }
    }
    if (!url.hostname.endsWith('google.com') && !url.hostname.endsWith('google.co.in')) return null;
    if (url.pathname !== '/search') return null;
    const query = url.searchParams.get('q')?.trim();
    if (!query || query.length < 2) return null;

    // Only query the price provider when the visible Google results indicate a game.
    // A video-game knowledge panel or a PC storefront result is the recognition signal.
    const resultText = document.querySelector('#search')?.innerText?.toLowerCase() || document.body.innerText.slice(0, 12000).toLowerCase();
    const gameKnowledge = /\b(video game|pc game|video game series)\b/.test(resultText);
    const pcStoreResult = [...document.querySelectorAll('#search a[href]')].some((link) => {
      try {
        const hostname = new URL(link.href).hostname.toLowerCase();
        return hostname === 'store.steampowered.com' || hostname.endsWith('.gog.com') || hostname.endsWith('.epicgames.com') || hostname.endsWith('.humblebundle.com') || hostname.endsWith('.fanatical.com') || hostname.endsWith('.greenmangaming.com');
      } catch { return false; }
    });
    return gameKnowledge || pcStoreResult ? { query, steamAppId: null, kind: 'search' } : null;
  }

  function createWidget() {
    let host = document.getElementById(WIDGET_ID);
    if (host) { shadow = host.shadowRoot; return shadow; }
    host = document.createElement('div');
    host.id = WIDGET_ID;
    host.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:2147483647;width:min(360px,calc(100vw - 24px));max-height:min(570px,calc(100vh - 36px));';
    shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        *{box-sizing:border-box} .launcher-wrap{display:flex;justify-content:flex-end}.launcher{display:flex;align-items:center;gap:8px;padding:8px 11px;border:1px solid #383346;border-radius:13px;background:#14131b;color:#f5f3fa;box-shadow:0 8px 26px #0008;cursor:pointer;font:700 12px/1 system-ui,-apple-system,Segoe UI,sans-serif}.launcher-mark{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(135deg,#c3afff,#6bd8e4);color:#17131e;font-size:10px}.launcher-arrow{font-size:17px;color:#c3afff}.panel{font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:#f5f3fa;background:#14131b;border:1px solid #383346;border-radius:14px;box-shadow:0 16px 48px #0009;overflow:hidden;max-height:min(570px,calc(100vh - 36px));display:flex;flex-direction:column}
        .head{display:flex;align-items:center;gap:10px;padding:12px 13px;border-bottom:1px solid #2c2935}.mark{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;background:linear-gradient(135deg,#c3afff,#6bd8e4);color:#17131e;font-weight:800;font-size:11px;flex:none}.brand{flex:1;min-width:0}.brand strong{display:block;font-size:13px}.brand small{display:block;color:#aaa4b5;font-size:10px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.close{border:0;background:transparent;color:#c5bfce;font-size:20px;line-height:1;padding:3px 6px;cursor:pointer}.currency-control{position:relative}.currency-current{width:34px;height:34px;border:1px solid #494258;border-radius:9px;background:#211e29;font:20px/1 system-ui;cursor:pointer}.currency-menu{position:absolute;right:0;top:calc(100% + 7px);display:grid;grid-template-columns:repeat(4,38px);gap:5px;padding:8px;background:#211e29;border:1px solid #494258;border-radius:10px;box-shadow:0 8px 24px #000b;z-index:3}.currency-menu button{height:34px;border:0;border-radius:6px;background:#2c2935;font:19px/1 system-ui;cursor:pointer}.currency-menu button:hover{background:#494258}
        .body{padding:10px;overflow:auto}.state{padding:14px 7px;color:#b7b1c0;font-size:12px}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;padding:10px 8px;border:1px solid #302c39;border-radius:10px;background:#1a1821;margin-bottom:7px}.title{font-weight:650;min-width:0;overflow-wrap:anywhere}.price{color:#78d9c3;font-weight:700;white-space:nowrap}.sub{grid-column:1/-1;color:#a8a2b2;font-size:10px}.actions{grid-column:1/-1;display:flex;gap:7px}.actions button,.offers a{border:1px solid #494258;border-radius:7px;padding:6px 9px;background:#262231;color:#d9cff5;font-size:11px;text-decoration:none;cursor:pointer}.actions .compare{background:#a78bfa;border-color:#a78bfa;color:#191421;font-weight:700}.offer{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 8px;border-top:1px solid #302c39;font-size:11px}.offer span:last-child{font-weight:700;color:#f4f1fa;white-space:nowrap}.offers{grid-column:1/-1;margin-top:2px}.offers a{display:inline-block;margin:8px 0 0}.footer{padding:8px 12px;border-top:1px solid #2c2935;color:#898394;font-size:9px}.hidden{display:none!important}
        @media(max-width:380px){.body{padding:8px}.row{padding:9px 7px}}
      </style>
      <div class="launcher-wrap"><button class="launcher" type="button" aria-label="Open DealForge game deals"><span class="launcher-mark">DF</span><span class="launcher-arrow" aria-hidden="true">↗</span></button></div>
      <section class="panel hidden" aria-label="DealForge game price comparison">
        <header class="head"><span class="mark">DF</span><div class="brand"><strong>DealForge</strong><small>Forge the Deal. Own the Game.</small></div><div class="currency-control"><button class="currency-current" type="button" title="United States Dollar" aria-label="Display currency: USD">🇺🇸</button><div class="currency-menu hidden" role="listbox" aria-label="Choose currency">${currencies.map(([code, flag, label]) => `<button type="button" data-currency="${code}" title="${label}" aria-label="${label} (${code})">${flag}</button>`).join('')}</div></div><button class="close" type="button" aria-label="Close DealForge">×</button></header>
        <div class="body"><div class="state">Checking the game in this tab…</div></div>
        <footer class="footer">Prices are provider-listed USD. Region and edition details may be incomplete; verify before purchase.</footer>
      </section>`;
    shadow = host.shadowRoot;
    shadow.querySelector('.launcher').addEventListener('click', () => { shadow.querySelector('.panel').classList.remove('hidden'); shadow.querySelector('.launcher-wrap').classList.add('hidden'); });
    shadow.querySelector('.close').addEventListener('click', () => { shadow.querySelector('.panel').classList.add('hidden'); shadow.querySelector('.launcher-wrap').classList.remove('hidden'); });
    shadow.querySelector('.currency-current').addEventListener('click', () => shadow.querySelector('.currency-menu').classList.toggle('hidden'));
    shadow.querySelectorAll('[data-currency]').forEach((button) => button.addEventListener('click', () => selectCurrency(button.dataset.currency)));
    document.documentElement.append(host);
    return shadow;
  }

  function renderState(message) {
    const root = createWidget();
    root.querySelector('.body').innerHTML = `<div class="state">${escapeHtml(message)}</div>`;
  }

  function renderGames(games) {
    const root = createWidget();
    const body = root.querySelector('.body');
    if (!games.length) { body.innerHTML = '<div class="state">No matching PC game was found. Try the game’s full title.</div>'; return; }
    body.innerHTML = games.slice(0, 6).map((game) => `<article class="row" data-game="${escapeHtml(game.providerId)}"><div class="title">${escapeHtml(game.title)}</div><div class="price">${priceNode(game.cheapest)}</div><div class="sub">Cheapest listed by CheapShark · provider result</div><div class="actions"><button type="button" class="compare">Compare offers</button><button type="button" class="save">Add to wishlist</button></div><div class="offers hidden"></div></article>`).join('');
    body.querySelectorAll('.row').forEach((row, index) => {
      const game = games[index];
      row.querySelector('.compare').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const output = row.querySelector('.offers');
        button.disabled = true; button.textContent = 'Checking…';
        const reply = await chrome.runtime.sendMessage({ type: 'DEALFORGE_GAME_OFFERS', providerId: game.providerId });
        button.disabled = false; button.textContent = 'Compare offers';
        if (!reply?.ok) { output.innerHTML = `<div class="state">${escapeHtml(reply?.error || 'Provider unavailable. Try again.')}</div>`; output.classList.remove('hidden'); return; }
        const details = reply.game;
        output.innerHTML = details.offers.length ? details.offers.slice(0, 4).map((offer) => `<div class="offer"><span>${escapeHtml(offer.store)}</span><span>${priceNode(offer.price)} <a href="${escapeHtml(offer.purchaseUrl)}" target="_blank" rel="noopener noreferrer">Buy ↗</a></span></div>`).join('') : '<div class="state">No current offers returned.</div>';
        refreshPrices();
        output.classList.remove('hidden');
      });
      row.querySelector('.save').addEventListener('click', async (event) => {
        const button = event.currentTarget;
        const reply = await chrome.runtime.sendMessage({ type: 'DEALFORGE_SAVE_GAME', game });
        if (reply?.ok) { button.textContent = 'Saved ✓'; button.disabled = true; }
        else button.textContent = 'Try again';
      });
    });
  }

  async function detectCurrentPage() {
    const game = pageGame();
    if (!game || location.href === lastProcessedUrl || location.href === dismissedUrl) return;
    lastProcessedUrl = location.href;
    renderState(`Found “${game.query}” in this tab. Looking up PC prices…`);
    try {
      const reply = await chrome.runtime.sendMessage({ type: 'DEALFORGE_DETECT_GAME', query: game.query, steamAppId: game.steamAppId });
      if (reply?.ok) { renderGames(reply.games); refreshPrices(); }
      else renderState(reply?.error || 'DealForge could not reach its price provider.');
    } catch { renderState('DealForge could not reach its price provider. Open the extension menu to retry.'); }
  }

  loadCurrency();
  detectCurrentPage();
  let checkScheduled = false;
  new MutationObserver(() => {
    if (checkScheduled) return;
    checkScheduled = true;
    setTimeout(() => { checkScheduled = false; detectCurrentPage(); }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });
})();

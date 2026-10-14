# DealForge

**Forge the Deal. Own the Game.**

DealForge is a Chrome Manifest V3 PC-game price comparison extension. This first milestone is intentionally local-first: the extension stores wishlist and alert preferences in `chrome.storage.local`, and searches CheapShark's documented API for current PC game offers.

## Load in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Select **Load unpacked** and choose this repository folder.
4. Pin DealForge from the Extensions menu.
5. Open the popup, search a game, and select **＋** to save it. Select **Offers** to compare returned deals.
6. Open the dashboard with the arrow button to configure a target price, enable alerts, and choose preferences.

No paid service, database, backend, account, or API key is required for this milestone. Demo mode is separate and explicitly labeled; its sample amounts are not current prices.

## Current architecture

- `manifest.json`: MV3 extension setup and narrowly scoped Google/Steam content-script matches.
- `src/providers/cheapshark.js`: provider adapter for documented CheapShark game search and game lookup operations.
- `src/storage.js`: local storage wrapper and duplicate-safe wishlist save.
- `src/background.js`: Chrome alarm based price checks every six hours while Chrome can run the extension, with duplicate event suppression and threshold re-arming.
- `src/content.js`: recognizes Google results when a video-game knowledge panel or PC storefront result is present, and Steam product pages by App ID. It shows an inline comparison widget and does not inspect checkout pages or transmit unrelated searches.
- `popup.html` / `dashboard.html`: search, offer comparison, wishlist, alert configuration, preferences, and JSON export.

## Provider and data limits

CheapShark's API currently supports game search, game lookup, live deal listings, and a cheapest-ever price point. It does not give this MVP adapter a verified retailer authorization classification, reliable country availability, a full price history series, or provider-backed currency conversion. Offers therefore preserve and show their provider-reported USD value and label region/edition as unspecified; the UI does not claim a store is authorized or assert that an offer is locally purchasable. Confirm offer terms and availability at checkout.

The official CheapShark API workspace documents `GET /api/1.0/games?title=...` and `GET /api/1.0/games?id=...`: [CheapShark API documentation](https://www.postman.com/cheapshark/cheapshark-s-public-workspace/documentation/7h22uhl/cheapshark-api).

## Alerts and permissions

The extension checks saved CheapShark game records using a Chrome alarm about every six hours, and also after startup. Chrome may suspend or stop background work, so this is not a guaranteed always-on scheduler. Browser notifications require notification permission to be granted in Chrome. Repeated notifications for the same unchanged deal are suppressed; an alert re-arms after the qualifying deal disappears. Predicted prices never trigger alerts. No server or email delivery is implemented.

## What is implemented

- Live PC game search and current deal lookup through CheapShark.
- Offer sorting by listed price, store, provider, reported discount, link, and check timestamp where available.
- Persistent anonymous wishlist, edit/remove, target price, alert pause/resume, search/filter/sort, and JSON export.
- Chrome notification checks with duplicate suppression and re-arming.
- Automatic Google/Steam game recognition, inline search results and offer comparison, and active-tab search reuse in the popup.
- Separate demo-mode fixtures, never presented as live data.
- Honest provider status and unavailable history/prediction states.

## Not implemented yet

PostgreSQL/Express backend, server-side recurring scheduler, account sync, historical time-series charts, currency conversion, verified retailer trust data, regional offer guarantees, ML training/predictions, notification history, import, and cloud/email notifications. Steam, GOG, Epic, and other direct store adapters are not configured.

There is no dependency install step. JavaScript modules use browser APIs and the built-in Fetch API. Run the provider, wishlist, and alert logic tests with `npm test` (or `node --test test/*.test.js`). Chrome-level UI testing and CI are not configured yet.

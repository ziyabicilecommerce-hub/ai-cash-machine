// Live Market Scanner - sucht ÜBER die konfigurierten TRADING_SYMBOLS
// hinaus nach Coins mit starkem Momentum (CoinGecko Top-100 nach
// Marktkapitalisierung, kostenlos, kein API-Key). REIN INFORMATIV: fügt
// NIE automatisch ein neues Symbol zum Bot hinzu - Coins ins Portfolio
// aufzunehmen bleibt bewusst eine manuelle Entscheidung (TRADING_SYMBOLS in
// wrangler.toml anpassen und deployen), damit nicht unbemerkt Kapital in
// unbeobachtete Coins fließt.
//
// Läuft einmal pro Tag (nicht bei jedem 5-Minuten-Cron) - schont
// CoinGeckos kostenloses Rate-Limit (siehe auch marktdaten.mjs, das
// dieselbe API für den Fear&Greed-/BTC-Dominanz-Filter nutzt).

import { COINGECKO_IDS } from './marktdaten.mjs';
import { notify } from './notify.mjs';

const COINGECKO_MARKETS_URL = 'https://api.coingecko.com/api/v3/coins/markets';
const TOP_N = 100;
const MAX_TREFFER = 10;

function heute() {
  return new Date().toISOString().slice(0, 10);
}

export async function pruefeUndAktualisiereScanner(env, cfg) {
  if (!cfg.scanner) return;
  const heuteStr = heute();
  const letzterTag = await env.TRADING_STATE.get('scanner:letzterTag');
  if (letzterTag === heuteStr) return;

  try {
    const url = `${COINGECKO_MARKETS_URL}?vs_currency=usd&order=market_cap_desc&per_page=${TOP_N}&page=1&price_change_percentage=24h,7d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`CoinGecko-Fehler: ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Unerwartetes CoinGecko-Format');

    const bereitsGehandelteIds = new Set(cfg.symbols.map((s) => COINGECKO_IDS[s]).filter(Boolean));

    const treffer = data
      .filter((c) => !bereitsGehandelteIds.has(c.id))
      .filter((c) => typeof c.price_change_percentage_7d_in_currency === 'number' && c.price_change_percentage_7d_in_currency >= cfg.scannerMomentumSchwelle7d)
      .filter((c) => typeof c.price_change_percentage_24h_in_currency === 'number' && c.price_change_percentage_24h_in_currency > 0)
      .sort((a, b) => b.price_change_percentage_7d_in_currency - a.price_change_percentage_7d_in_currency)
      .slice(0, MAX_TREFFER)
      .map((c) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        preisUsd: c.current_price,
        change24hProzent: c.price_change_percentage_24h_in_currency,
        change7dProzent: c.price_change_percentage_7d_in_currency,
        marketCapRang: c.market_cap_rank,
      }));

    await env.TRADING_STATE.put('scanner:trending', JSON.stringify({ treffer, berechnetAm: new Date().toISOString(), momentumSchwelle7d: cfg.scannerMomentumSchwelle7d }));

    if (treffer.length) {
      const zeilen = treffer.map((t) => `${t.symbol}: +${t.change7dProzent.toFixed(0)}% (7T), +${t.change24hProzent.toFixed(1)}% (24h) - Rang #${t.marketCapRang}`);
      await notify(env, `🔍 Live Market Scanner: ${treffer.length} Coin(s) mit starkem Momentum außerhalb deiner konfigurierten Symbole:\n${zeilen.join('\n')}\n\nRein informativ - füge Symbole nur bewusst in TRADING_SYMBOLS hinzu, keine automatische Übernahme.`);
    }
  } catch (err) {
    console.error('[trading-bot] Live Market Scanner fehlgeschlagen:', err);
  }
  await env.TRADING_STATE.put('scanner:letzterTag', heuteStr);
}

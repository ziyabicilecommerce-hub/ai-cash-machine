// Alpaca-Paper-Trading-Adapter für US-Aktien - gleiche Grund-Schnittstelle
// wie die Krypto-Börsen-Adapter in trading-bot-worker/lib/exchanges.mjs
// (getKlines, getMinNotionalUsdt, getSpreadProzent, placeMarketBuy,
// placeMarketSell), aber bewusst NUR gegen Alpacas Paper-Trading-Endpoint
// (paper-api.alpaca.markets) - andere Domain als Alpacas Live-Handel, kann
// also strukturell NIE echtes Geld bewegen, selbst bei falscher Konfiguration.
// Kostenlose Marktdaten über den IEX-Feed (feed=iex), im kostenlosen Alpaca-
// Tarif enthalten.

const TRADING_BASE = 'https://paper-api.alpaca.markets';
const DATA_BASE = 'https://data.alpaca.markets';
const BARS_LIMIT = 100;
const TIMEFRAME_MAP = { 15: '15Min', 240: '4Hour' };

function authHeaders(env) {
  return { 'APCA-API-KEY-ID': env.ALPACA_API_KEY, 'APCA-API-SECRET-KEY': env.ALPACA_API_SECRET };
}

// Aktien handeln nur zu Börsenzeiten (anders als Krypto rund um die Uhr) -
// Alpacas eigener Handelskalender berücksichtigt auch US-Feiertage, deshalb
// hier abgefragt statt selbst eine Feiertagsliste zu pflegen.
export async function istMarktOffen(env) {
  try {
    const res = await fetch(`${TRADING_BASE}/v2/clock`, { headers: authHeaders(env) });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.is_open;
  } catch {
    return false;
  }
}

export async function getKlines(env, symbol, intervalMinuten = 15) {
  const timeframe = TIMEFRAME_MAP[intervalMinuten] || '15Min';
  const res = await fetch(`${DATA_BASE}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${BARS_LIMIT}&feed=iex&adjustment=raw`, { headers: authHeaders(env) });
  if (!res.ok) throw new Error(`Alpaca Bars-Fehler (${symbol}): ${res.status}`);
  const data = await res.json();
  const bars = data.bars || [];
  return {
    closes: bars.map((b) => b.c),
    highs: bars.map((b) => b.h),
    lows: bars.map((b) => b.l),
  };
}

// Alpaca unterstützt Bruchteils-Aktien (fractional shares) ab $1 Notional -
// deutlich niedrigere Mindest-Ordergröße als bei den meisten Krypto-Börsen.
export async function getMinNotionalUsdt() {
  return 1;
}

export async function getSpreadProzent(env, symbol) {
  try {
    const res = await fetch(`${DATA_BASE}/v2/stocks/${symbol}/quotes/latest?feed=iex`, { headers: authHeaders(env) });
    if (!res.ok) return null;
    const data = await res.json();
    const ask = data.quote && data.quote.ap;
    const bid = data.quote && data.quote.bp;
    if (!ask || !bid) return null;
    return ((ask - bid) / bid) * 100;
  } catch {
    return null;
  }
}

// Wartet kurz auf die Order-Bestätigung (Market-Orders im Paper-Handel
// füllen normalerweise innerhalb von Sekunden) - wirft bei Unklarheit über
// den Order-Status einen Fehler statt zu raten, statt endlos zu warten.
async function wartenAufFuellung(env, orderId, versuche = 6) {
  for (let i = 0; i < versuche; i++) {
    const res = await fetch(`${TRADING_BASE}/v2/orders/${orderId}`, { headers: authHeaders(env) });
    if (res.ok) {
      const order = await res.json();
      if (order.status === 'filled') return order;
      if (['canceled', 'expired', 'rejected'].includes(order.status)) {
        throw new Error(`Alpaca-Order ${orderId} nicht ausgeführt (status=${order.status})`);
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Alpaca-Order ${orderId} nach mehreren Versuchen nicht bestätigt ausgeführt - Status unklar, bitte Konto manuell prüfen.`);
}

export async function placeMarketBuy(env, symbol, notionalUsd) {
  const res = await fetch(`${TRADING_BASE}/v2/orders`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({ symbol, notional: notionalUsd.toFixed(2), side: 'buy', type: 'market', time_in_force: 'day' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Alpaca-Kauf für ${symbol} fehlgeschlagen: ${data.message || JSON.stringify(data)}`);
  const order = await wartenAufFuellung(env, data.id);
  const qty = parseFloat(order.filled_qty);
  const preis = parseFloat(order.filled_avg_price);
  if (!(qty > 0) || !(preis > 0)) throw new Error(`Alpaca-Kauf für ${symbol} ohne gültige Füllmenge/-preis zurückgekommen - kein Einstieg gebucht.`);
  return { qty, preis };
}

export async function placeMarketSell(env, symbol, qty) {
  const res = await fetch(`${TRADING_BASE}/v2/orders`, {
    method: 'POST',
    headers: { ...authHeaders(env), 'content-type': 'application/json' },
    body: JSON.stringify({ symbol, qty: String(qty), side: 'sell', type: 'market', time_in_force: 'day' }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Alpaca-Verkauf für ${symbol} fehlgeschlagen: ${data.message || JSON.stringify(data)}`);
  const order = await wartenAufFuellung(env, data.id);
  const erloes = parseFloat(order.filled_qty) * parseFloat(order.filled_avg_price);
  if (!(erloes > 0)) throw new Error(`Alpaca-Verkauf für ${symbol} ohne gültigen Erlös zurückgekommen - Position bleibt im State offen, bitte Konto manuell prüfen.`);
  return { erloes };
}

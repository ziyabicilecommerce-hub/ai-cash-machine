// Exchange-Adapter (Binance + Kraken) - jeder liefert dieselbe Schnittstelle,
// damit worker.js unabhängig von der konkreten Börse bleibt: getKlines,
// getMinNotionalUsdt, getSpreadProzent, placeMarketBuy (liefert {qty, preis},
// wirft bei jeder Unklarheit über den Order-Status einen Fehler statt zu
// raten), placeMarketSell (liefert {erloes}).

const KLINES_LIMIT = 100;

// ================= KRYPTO / SIGNIERUNG (Web Crypto API) =================

function hexFromBuffer(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hexFromBuffer(sig);
}

function base64Decode(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64Encode(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function krakenSign(path, nonce, postdata, secretBase64) {
  const encoder = new TextEncoder();
  const sha256Digest = await crypto.subtle.digest('SHA-256', encoder.encode(nonce + postdata));
  const pathBytes = encoder.encode(path);
  const message = new Uint8Array(pathBytes.length + sha256Digest.byteLength);
  message.set(pathBytes, 0);
  message.set(new Uint8Array(sha256Digest), pathBytes.length);
  const key = await crypto.subtle.importKey('raw', base64Decode(secretBase64), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, message);
  return base64Encode(sig);
}

// ================= EXCHANGE-ADAPTER =================

const binanceAdapter = {
  name: 'binance',
  baseUrl: 'https://api.binance.com',

  async signedRequest(env, path, params = {}, method = 'GET') {
    const fullParams = { ...params, timestamp: Date.now(), recvWindow: '10000' };
    const query = new URLSearchParams(fullParams).toString();
    const signature = await hmacSha256Hex(env.BINANCE_API_SECRET, query);
    const res = await fetch(`${this.baseUrl}${path}?${query}&signature=${signature}`, {
      method,
      headers: { 'X-MBX-APIKEY': env.BINANCE_API_KEY },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Binance-Fehler (${res.status}): ${data.msg || JSON.stringify(data)}`);
    return data;
  },

  async getKlines(symbol, intervalMinuten = 15) {
    const intervalMap = { 15: '15m', 240: '4h' };
    const interval = intervalMap[intervalMinuten] || '15m';
    const res = await fetch(`${this.baseUrl}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${KLINES_LIMIT}`);
    if (!res.ok) throw new Error(`Binance Klines-Fehler: ${res.status}`);
    const data = await res.json();
    return {
      closes: data.map((k) => parseFloat(k[4])),
      highs: data.map((k) => parseFloat(k[2])),
      lows: data.map((k) => parseFloat(k[3])),
    };
  },

  async getMinNotionalUsdt(symbol) {
    const res = await fetch(`${this.baseUrl}/api/v3/exchangeInfo?symbol=${symbol}`);
    if (!res.ok) throw new Error(`Binance ExchangeInfo-Fehler: ${res.status}`);
    const data = await res.json();
    const filters = (data.symbols && data.symbols[0] && data.symbols[0].filters) || [];
    const filter = filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
    return filter ? parseFloat(filter.minNotional) : null;
  },

  // Für lib/benchmark.mjs: reiner "was hätte Kaufen-und-Liegenlassen seit
  // diesem Datum gebracht" Vergleichswert - kein zusätzlicher Klines-API-
  // Key nötig, beides öffentliche Endpoints.
  async getBuyHoldRendite(symbol, seitDatumIso) {
    const startMs = new Date(seitDatumIso).getTime();
    const startRes = await fetch(`${this.baseUrl}/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${startMs}&limit=1`);
    if (!startRes.ok) throw new Error(`Binance Klines-Fehler (Start): ${startRes.status}`);
    const startData = await startRes.json();
    if (!startData.length) return null;
    const startPreis = parseFloat(startData[0][4]);

    const aktuellRes = await fetch(`${this.baseUrl}/api/v3/klines?symbol=${symbol}&interval=1d&limit=1`);
    if (!aktuellRes.ok) throw new Error(`Binance Klines-Fehler (Aktuell): ${aktuellRes.status}`);
    const aktuellData = await aktuellRes.json();
    if (!aktuellData.length) return null;
    const aktuellPreis = parseFloat(aktuellData[aktuellData.length - 1][4]);

    if (!startPreis || !aktuellPreis) return null;
    return { startPreis, aktuellPreis, renditeProzent: ((aktuellPreis / startPreis) - 1) * 100 };
  },

  async getSpreadProzent(symbol) {
    try {
      const res = await fetch(`${this.baseUrl}/api/v3/ticker/bookTicker?symbol=${symbol}`);
      if (!res.ok) return null;
      const data = await res.json();
      const ask = parseFloat(data.askPrice);
      const bid = parseFloat(data.bidPrice);
      if (!ask || !bid) return null;
      return ((ask - bid) / bid) * 100;
    } catch {
      return null;
    }
  },

  async placeMarketBuy(env, symbol, quoteUsdt) {
    const order = await this.signedRequest(env, '/api/v3/order', { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: quoteUsdt.toFixed(2) }, 'POST');
    const qty = parseFloat(order.executedQty);
    // Binance kann eine Order mit HTTP 200 zurückgeben, ohne dass sie
    // (vollständig) ausgeführt wurde (status "EXPIRED", executedQty "0").
    if (!(qty > 0) || order.status !== 'FILLED') {
      throw new Error(`Binance-Kauf für ${symbol} nicht vollständig ausgeführt (status=${order.status}, executedQty=${order.executedQty}) - kein Einstieg gebucht.`);
    }
    return { qty, preis: parseFloat(order.cummulativeQuoteQty) / qty };
  },

  async placeMarketSell(env, symbol, qty) {
    const order = await this.signedRequest(env, '/api/v3/order', { symbol, side: 'SELL', type: 'MARKET', quantity: String(qty) }, 'POST');
    if (!(parseFloat(order.executedQty) > 0) || order.status !== 'FILLED') {
      throw new Error(`Binance-Verkauf für ${symbol} nicht vollständig ausgeführt (status=${order.status}, executedQty=${order.executedQty}) - Position bleibt im State offen, bitte Konto manuell prüfen.`);
    }
    return { erloes: parseFloat(order.cummulativeQuoteQty) };
  },
};

const krakenAdapter = {
  name: 'kraken',
  baseUrl: 'https://api.kraken.com',

  async privateRequest(env, path, params = {}) {
    const nonce = String(Date.now() * 1000);
    const postdata = new URLSearchParams({ nonce, ...params }).toString();
    const signature = await krakenSign(path, nonce, postdata, env.KRAKEN_API_SECRET);
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'API-Key': env.KRAKEN_API_KEY, 'API-Sign': signature, 'content-type': 'application/x-www-form-urlencoded' },
      body: postdata,
    });
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    return data.result;
  },

  async getKlines(symbol, intervalMinuten = 15) {
    const res = await fetch(`${this.baseUrl}/0/public/OHLC?pair=${symbol}&interval=${intervalMinuten}`);
    if (!res.ok) throw new Error(`Kraken OHLC-Fehler: ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    const resultKey = Object.keys(data.result || {}).find((k) => k !== 'last');
    const rows = (resultKey && data.result[resultKey]) || [];
    return {
      closes: rows.map((r) => parseFloat(r[4])),
      highs: rows.map((r) => parseFloat(r[2])),
      lows: rows.map((r) => parseFloat(r[3])),
    };
  },

  async getMinNotionalUsdt(symbol, referencePreis) {
    const res = await fetch(`${this.baseUrl}/0/public/AssetPairs?pair=${symbol}`);
    if (!res.ok) throw new Error(`Kraken AssetPairs-Fehler: ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    const key = Object.keys(data.result || {})[0];
    const ordermin = key && data.result[key] ? parseFloat(data.result[key].ordermin) : null;
    return ordermin && referencePreis ? ordermin * referencePreis : null;
  },

  // Für lib/benchmark.mjs: reiner "was hätte Kaufen-und-Liegenlassen seit
  // diesem Datum gebracht" Vergleichswert - öffentlicher Endpoint, kein Key.
  async getBuyHoldRendite(symbol, seitDatumIso) {
    const seitSekunden = Math.floor(new Date(seitDatumIso).getTime() / 1000);
    const res = await fetch(`${this.baseUrl}/0/public/OHLC?pair=${symbol}&interval=1440&since=${seitSekunden}`);
    if (!res.ok) throw new Error(`Kraken OHLC-Fehler: ${res.status}`);
    const data = await res.json();
    if (data.error && data.error.length) throw new Error(`Kraken-Fehler: ${data.error.join(', ')}`);
    const resultKey = Object.keys(data.result || {}).find((k) => k !== 'last');
    const rows = (resultKey && data.result[resultKey]) || [];
    if (!rows.length) return null;
    const startPreis = parseFloat(rows[0][4]);
    const aktuellPreis = parseFloat(rows[rows.length - 1][4]);
    if (!startPreis || !aktuellPreis) return null;
    return { startPreis, aktuellPreis, renditeProzent: ((aktuellPreis / startPreis) - 1) * 100 };
  },

  // Bid/Ask-Spread in Prozent - null bei Fehler (Filter dann nicht
  // blockierend, siehe Aufrufstelle in runSymbol).
  async getSpreadProzent(symbol) {
    try {
      const res = await fetch(`${this.baseUrl}/0/public/Ticker?pair=${symbol}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (data.error && data.error.length) return null;
      const key = Object.keys(data.result || {})[0];
      const t = key && data.result[key];
      const ask = t && parseFloat(t.a[0]);
      const bid = t && parseFloat(t.b[0]);
      if (!ask || !bid) return null;
      return ((ask - bid) / bid) * 100;
    } catch {
      return null;
    }
  },

  async placeMarketBuy(env, symbol, quoteUsdt, referencePreis) {
    // Kraken kennt anders als Binance kein "kaufe für X USDT" - nur Menge in
    // der Basiswährung. Menge wird aus dem zuletzt bekannten Preis geschätzt,
    // der TATSÄCHLICHE Ausführungspreis wird danach über QueryOrders verifiziert.
    const volumeApprox = quoteUsdt / referencePreis;
    const result = await this.privateRequest(env, '/0/private/AddOrder', { pair: symbol, type: 'buy', ordertype: 'market', volume: volumeApprox.toFixed(8) });
    const txid = result && result.txid && result.txid[0];
    if (!txid) throw new Error(`Kraken-Kauf für ${symbol}: keine Order-ID zurückbekommen, Status unklar - kein Einstieg gebucht.`);
    const info = await this.privateRequest(env, '/0/private/QueryOrders', { txid });
    const order = info && info[txid];
    if (!order || order.status !== 'closed' || !(parseFloat(order.vol_exec) > 0)) {
      throw new Error(`Kraken-Kauf für ${symbol} nicht bestätigt ausgeführt (status=${order && order.status}) - kein Einstieg gebucht.`);
    }
    return { qty: parseFloat(order.vol_exec), preis: parseFloat(order.price) };
  },

  async placeMarketSell(env, symbol, qty) {
    const result = await this.privateRequest(env, '/0/private/AddOrder', { pair: symbol, type: 'sell', ordertype: 'market', volume: String(qty) });
    const txid = result && result.txid && result.txid[0];
    if (!txid) throw new Error(`Kraken-Verkauf für ${symbol}: keine Order-ID zurückbekommen, Status unklar - Position bleibt im State offen, bitte Konto manuell prüfen.`);
    const info = await this.privateRequest(env, '/0/private/QueryOrders', { txid });
    const order = info && info[txid];
    if (!order || order.status !== 'closed' || !(parseFloat(order.vol_exec) > 0)) {
      throw new Error(`Kraken-Verkauf für ${symbol} nicht bestätigt ausgeführt (status=${order && order.status}) - Position bleibt im State offen, bitte Konto manuell prüfen.`);
    }
    return { erloes: parseFloat(order.vol_exec) * parseFloat(order.price) };
  },
};

// ================= COINBASE =================
// Öffentliche Marktdaten (Kerzen/Spread/Mindestgröße) laufen über die
// Coinbase-Exchange-API (api.exchange.coinbase.com) - live per curl
// verifiziert, kein Auth nötig. Echte Order-Platzierung läuft über die
// neuere Advanced-Trade-API (api.coinbase.com/api/v3/brokerage): live per
// curl geprüft, dass diese NUR noch den "Authorization"-Header akzeptiert
// (kein CB-ACCESS-KEY/SIGN mehr wie früher bei Coinbase Pro) - das ist die
// von Coinbase dokumentierte JWT(ES256)-Signierung mit einem CDP-API-Key.
// COINBASE_API_KEY = CDP-Key-Name ("organizations/.../apiKeys/..."),
// COINBASE_API_SECRET = zugehöriger EC-Private-Key im PKCS8-PEM-Format
// ("-----BEGIN PRIVATE KEY-----..."), so wie ihn das CDP-Portal für einen
// neu erstellten Advanced-Trade-Key standardmäßig ausgibt.

function base64UrlEncodeBuf(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlEncodeStr(str) {
  return base64UrlEncodeBuf(new TextEncoder().encode(str));
}

async function importCoinbaseEcPrivateKey(pem) {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/\s+/g, '');
  return crypto.subtle.importKey('pkcs8', base64Decode(b64), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function coinbaseJwt(env, method, path) {
  const keyName = env.COINBASE_API_KEY;
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'ES256', kid: keyName, typ: 'JWT', nonce: crypto.randomUUID().replace(/-/g, '') };
  const payload = { sub: keyName, iss: 'cdp', nbf: now, exp: now + 120, uri: `${method} api.coinbase.com${path}` };
  const signingInput = `${base64UrlEncodeStr(JSON.stringify(header))}.${base64UrlEncodeStr(JSON.stringify(payload))}`;
  const key = await importCoinbaseEcPrivateKey(env.COINBASE_API_SECRET);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncodeBuf(sig)}`;
}

const coinbaseAdapter = {
  name: 'coinbase',
  baseUrl: 'https://api.exchange.coinbase.com',
  tradeBaseUrl: 'https://api.coinbase.com',

  async brokerageRequest(env, path, body, method = 'POST') {
    const jwt = await coinbaseJwt(env, method, path);
    const res = await fetch(`${this.tradeBaseUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(`Coinbase-Fehler (${res.status}): ${data.message || JSON.stringify(data)}`);
    return data;
  },

  async getKlines(symbol, intervalMinuten = 15) {
    // Coinbase erlaubt nur feste Granularitäten (60/300/900/3600/21600/86400
    // Sekunden). 900s (15m) trifft den Strategie-Zeitrahmen exakt. Für den
    // optionalen Multi-Timeframe-Filter (Default 240min/4h) gibt's kein
    // exaktes Pendant - 21600s (6h) ist die nächstliegende verfügbare
    // Granularität, keine exakte 4h-Kerze (Filter ist ohnehin nicht
    // blockierend, siehe hoehererZeitrahmenIstAufwaerts in marktdaten.mjs).
    const intervalMap = { 15: 900, 240: 21600 };
    const granularitaet = intervalMap[intervalMinuten] || 900;
    const res = await fetch(`${this.baseUrl}/products/${symbol}/candles?granularity=${granularitaet}`);
    if (!res.ok) throw new Error(`Coinbase Candles-Fehler: ${res.status}`);
    const data = await res.json(); // [time, low, high, open, close, volume], neueste zuerst
    const aufsteigend = [...data].reverse();
    return {
      closes: aufsteigend.map((k) => k[4]),
      highs: aufsteigend.map((k) => k[2]),
      lows: aufsteigend.map((k) => k[3]),
    };
  },

  async getMinNotionalUsdt(symbol) {
    const res = await fetch(`${this.baseUrl}/products/${symbol}`);
    if (!res.ok) throw new Error(`Coinbase Product-Fehler: ${res.status}`);
    const data = await res.json();
    // min_market_funds ist bei Coinbase bereits in der Quote-Währung (USD),
    // anders als Kraken (dort erst mit dem Referenzpreis multiplizieren).
    return data.min_market_funds ? parseFloat(data.min_market_funds) : null;
  },

  // Für lib/benchmark.mjs, siehe Binance/Kraken-Pendant oben.
  async getBuyHoldRendite(symbol, seitDatumIso) {
    const seitSekunden = Math.floor(new Date(seitDatumIso).getTime() / 1000);
    const startRes = await fetch(`${this.baseUrl}/products/${symbol}/candles?granularity=86400&start=${seitSekunden}&end=${seitSekunden + 86400}`);
    if (!startRes.ok) throw new Error(`Coinbase Candles-Fehler (Start): ${startRes.status}`);
    const startData = await startRes.json();
    if (!startData.length) return null;
    const startPreis = startData[startData.length - 1][4]; // älteste Kerze im Fenster

    const aktuellRes = await fetch(`${this.baseUrl}/products/${symbol}/candles?granularity=86400`);
    if (!aktuellRes.ok) throw new Error(`Coinbase Candles-Fehler (Aktuell): ${aktuellRes.status}`);
    const aktuellData = await aktuellRes.json();
    if (!aktuellData.length) return null;
    const aktuellPreis = aktuellData[0][4]; // neueste Kerze zuerst

    if (!startPreis || !aktuellPreis) return null;
    return { startPreis, aktuellPreis, renditeProzent: ((aktuellPreis / startPreis) - 1) * 100 };
  },

  async getSpreadProzent(symbol) {
    try {
      const res = await fetch(`${this.baseUrl}/products/${symbol}/book?level=1`);
      if (!res.ok) return null;
      const data = await res.json();
      const ask = data.asks && data.asks[0] && parseFloat(data.asks[0][0]);
      const bid = data.bids && data.bids[0] && parseFloat(data.bids[0][0]);
      if (!ask || !bid) return null;
      return ((ask - bid) / bid) * 100;
    } catch {
      return null;
    }
  },

  async placeMarketBuy(env, symbol, quoteUsdt) {
    const body = {
      client_order_id: crypto.randomUUID(),
      product_id: symbol,
      side: 'BUY',
      order_configuration: { market_market_ioc: { quote_size: quoteUsdt.toFixed(2) } },
    };
    const result = await this.brokerageRequest(env, '/api/v3/brokerage/orders', body);
    const orderId = result.success && result.success_response && result.success_response.order_id;
    if (!orderId) throw new Error(`Coinbase-Kauf für ${symbol} fehlgeschlagen: ${JSON.stringify(result.error_response || result)} - kein Einstieg gebucht.`);
    const info = await this.brokerageRequest(env, `/api/v3/brokerage/orders/historical/${orderId}`, null, 'GET');
    const order = info.order;
    const qty = order && parseFloat(order.filled_size);
    if (!order || order.status !== 'FILLED' || !(qty > 0)) {
      throw new Error(`Coinbase-Kauf für ${symbol} nicht vollständig ausgeführt (status=${order && order.status}) - kein Einstieg gebucht.`);
    }
    return { qty, preis: parseFloat(order.average_filled_price) };
  },

  async placeMarketSell(env, symbol, qty) {
    const body = {
      client_order_id: crypto.randomUUID(),
      product_id: symbol,
      side: 'SELL',
      order_configuration: { market_market_ioc: { base_size: String(qty) } },
    };
    const result = await this.brokerageRequest(env, '/api/v3/brokerage/orders', body);
    const orderId = result.success && result.success_response && result.success_response.order_id;
    if (!orderId) throw new Error(`Coinbase-Verkauf für ${symbol} fehlgeschlagen: ${JSON.stringify(result.error_response || result)} - Position bleibt im State offen, bitte Konto manuell prüfen.`);
    const info = await this.brokerageRequest(env, `/api/v3/brokerage/orders/historical/${orderId}`, null, 'GET');
    const order = info.order;
    if (!order || order.status !== 'FILLED' || !(parseFloat(order.filled_size) > 0)) {
      throw new Error(`Coinbase-Verkauf für ${symbol} nicht bestätigt ausgeführt (status=${order && order.status}) - Position bleibt im State offen, bitte Konto manuell prüfen.`);
    }
    return { erloes: parseFloat(order.filled_value) };
  },
};

export const EXCHANGES = { binance: binanceAdapter, kraken: krakenAdapter, coinbase: coinbaseAdapter };

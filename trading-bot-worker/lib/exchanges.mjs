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

export const EXCHANGES = { binance: binanceAdapter, kraken: krakenAdapter };

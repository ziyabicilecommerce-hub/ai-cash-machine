// Krypto-Spot-Trading-Bot als Cloudflare Worker (statt GitHub Actions).
//
// Warum ein eigener Worker? GitHub-Actions-Runner laufen aus IP-Bereichen,
// die Binance aus regulatorischen Gründen mit HTTP 451 blockiert - der Bot
// (automations/49-trading-bot.mjs) konnte deshalb NIE eine einzige Order
// abfragen, obwohl der Workflow selbst korrekt lief. Cloudflare Workers
// laufen am globalen Edge-Netzwerk und sind davon i.d.R. nicht betroffen.
//
// Gleiche Grund-Sicherheitsmechanismen wie vorher, unverändert: Paper-Modus
// per Default, Spot-only (kein Hebel), Stop-Loss pro Trade, Tagesverlust-
// Handelssperre, dauerhafter Gesamtverlust-Kill-Switch, Mindest-Ordergröße-
// Check vor jedem Kauf, mehrere Symbole mit unabhängigem Kapital-Anteil.
//
// NEU in diesem Ausbau:
// 1. RSI-Überkauft-Filter + ATR-Mindest-Volatilitätsfilter gegen die
//    klassische Schwäche eines reinen EMA-Crossovers: viele kleine
//    Fehlsignale (Whipsaws) in ruhigen/seitwärts laufenden Märkten.
// 2. Optionaler Trailing-Stop-Loss (Default AUS): sobald eine Position im
//    Plus liegt, zieht der Stop-Loss mit dem höchsten seit Einstieg
//    gesehenen Preis mit, statt starr am Einstiegspreis zu kleben - sichert
//    Gewinne statt sie bei einer Umkehr komplett wieder herzugeben.
// 3. Optionale volatilitätsbasierte Positionsgröße (Default AUS): bei hoher
//    Volatilität wird automatisch WENIGER eingesetzt als beim konfigurierten
//    Maximum - kann das Risiko nur SENKEN, nie über TRADING_MAX_POSITION_PROZENT
//    hinaus erhöhen.
// 4. Max-gleichzeitige-Positionen-Grenze (Default = Anzahl Symbole, also
//    unverändertes Verhalten): begrenzt, wie viele Symbole gleichzeitig eine
//    offene Position haben dürfen - reduziert das Klumpenrisiko, dass bei
//    einem marktweiten Crash alle Coins gleichzeitig einbrechen.
// 5. Exchange-Abstraktion mit Binance- UND Kraken-Adapter (TRADING_EXCHANGE).
//    Der Kraken-Adapter wurde in dieser Umgebung NICHT gegen ein echtes
//    Kraken-Konto getestet (kein Zugang hier) - vor Live-Einsatz zwingend
//    zuerst im Paper-Modus laufen lassen und die WhatsApp-Meldungen der
//    ersten paar Läufe genau prüfen.
// 6. GET /status - rein lesender Endpoint (eigenes Secret STATUS_READ_KEY)
//    für das Live-Dashboard, kann NIE einen Trade auslösen.
// 7. Tägliche WhatsApp-Zusammenfassung (einmal pro Kalendertag, automatisch
//    beim ersten Lauf nach Mitternacht UTC): Gesamtkapital, Gesamt-P&L in %,
//    offene Positionen, Kill-Switch-Status - damit man NICHT mehr aktiv das
//    Dashboard öffnen muss, um zu wissen, ob alles normal läuft.
//
// Alle neuen Risiko-Features sind standardmäßig AUS bzw. verhaltensneutral,
// damit ein bereits laufender Bot durch dieses Update nicht plötzlich anders
// handelt, ohne dass das bewusst konfiguriert wurde.

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf, emaSeries } from './lib/strategie.mjs';

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
// Jeder Adapter liefert dieselbe Schnittstelle, damit runSymbol() unabhängig
// von der konkreten Börse bleibt: getKlines, getMinNotionalUsdt, placeMarketBuy
// (liefert {qty, preis}, wirft bei jeder Unklarheit über den Order-Status
// einen Fehler statt zu raten), placeMarketSell (liefert {erloes}).

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

const EXCHANGES = { binance: binanceAdapter, kraken: krakenAdapter };

// ================= COINGECKO (optionaler Kauf-Filter, kein Key nötig) =================
// Zusätzliche, unabhängige Bestätigung vor einem Kauf: CoinGecko nutzt einen
// eigenen Datenfeed/Berechnung (nicht dieselbe Quelle wie die Exchange-Klines),
// verwirft ein Kaufsignal, wenn der Coin laut CoinGecko in den letzten 24h
// bereits im Minus steht - reduziert das Risiko, in einen fallenden Markt
// hinein zu kaufen, nur weil die Strategie auf Kraken-Daten allein ein Signal sieht.
const COINGECKO_IDS = {
  XBTUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  SOLUSDT: 'solana',
  XRPUSDT: 'ripple',
  ADAUSDT: 'cardano',
  DOGEUSDT: 'dogecoin',
  DOTUSDT: 'polkadot',
  LTCUSDT: 'litecoin',
};

async function ladeCoingecko24hChange(symbol) {
  const id = COINGECKO_IDS[symbol];
  if (!id) return null; // kein Mapping für dieses Symbol - Filter wird nicht angewendet
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data[id] && data[id].usd_24h_change;
    return typeof change === 'number' ? change : null;
  } catch {
    return null; // CoinGecko-Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// Zweite, unabhängige Datenquelle für dieselbe Art von Bestätigung
// (24h-Kursänderung) - bewusst NICHT als zusätzlicher, eigener UND-Filter
// verdrahtet (das würde Käufe nur noch seltener machen), sondern mit
// CoinGecko zu einem Durchschnitt gemittelt (ladePreisBestaetigung24h unten) -
// robuster gegen einen einzelnen abweichenden/fehlerhaften Datenpunkt, ohne
// die Kauf-Hürde ein zweites Mal zu erhöhen. CoinCap (ursprünglich angefragt)
// war von hier aus nicht erreichbar (wiederholt CONNECT-Fehler) - CoinPaprika
// als funktionierende, ebenfalls kostenlose Alternative gewählt.
const COINPAPRIKA_IDS = {
  XBTUSDT: 'btc-bitcoin',
  ETHUSDT: 'eth-ethereum',
  SOLUSDT: 'sol-solana',
  XRPUSDT: 'xrp-xrp',
  ADAUSDT: 'ada-cardano',
  DOGEUSDT: 'doge-dogecoin',
  DOTUSDT: 'dot-polkadot',
  LTCUSDT: 'ltc-litecoin',
};

async function ladeCoinpaprika24hChange(symbol) {
  const id = COINPAPRIKA_IDS[symbol];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data.quotes && data.quotes.USD && data.quotes.USD.percent_change_24h;
    return typeof change === 'number' ? change : null;
  } catch {
    return null;
  }
}

// Drei weitere, unabhängige Börsen-Ticker (jeweils kostenlos, kein Key
// nötig) - liefern die 24h-Kursänderung aus ihrem EIGENEN Orderbuch statt
// aus CoinGecko/CoinPaprikas aggregierten Daten. Gegen Ausfall/Umbenennung
// einzelner Quellen genauso abgesichert wie CoinGecko/CoinPaprika: bei
// Fehler oder fehlendem Mapping einfach null statt den Bot zu blockieren.
const OKX_IDS = {
  XBTUSDT: 'BTC-USDT', ETHUSDT: 'ETH-USDT', SOLUSDT: 'SOL-USDT', XRPUSDT: 'XRP-USDT',
  ADAUSDT: 'ADA-USDT', DOGEUSDT: 'DOGE-USDT', DOTUSDT: 'DOT-USDT', LTCUSDT: 'LTC-USDT',
};

async function ladeOkx24hChange(symbol) {
  const instId = OKX_IDS[symbol];
  if (!instId) return null;
  try {
    const res = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${instId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const t = data && data.data && data.data[0];
    const open = t && parseFloat(t.open24h);
    const last = t && parseFloat(t.last);
    if (!open || !Number.isFinite(last)) return null;
    return ((last - open) / open) * 100;
  } catch {
    return null;
  }
}

const GATEIO_IDS = {
  XBTUSDT: 'BTC_USDT', ETHUSDT: 'ETH_USDT', SOLUSDT: 'SOL_USDT', XRPUSDT: 'XRP_USDT',
  ADAUSDT: 'ADA_USDT', DOGEUSDT: 'DOGE_USDT', DOTUSDT: 'DOT_USDT', LTCUSDT: 'LTC_USDT',
};

async function ladeGateio24hChange(symbol) {
  const pair = GATEIO_IDS[symbol];
  if (!pair) return null;
  try {
    const res = await fetch(`https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${pair}`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && data[0] && parseFloat(data[0].change_percentage);
    return Number.isFinite(change) ? change : null;
  } catch {
    return null;
  }
}

// Bitstamp notiert in USD statt USDT - für eine 24h-PROZENT-Änderung als
// Zusatzbestätigung ist der kleine Unterschied zwischen beiden irrelevant.
const BITSTAMP_IDS = {
  XBTUSDT: 'btcusd', ETHUSDT: 'ethusd', SOLUSDT: 'solusd', XRPUSDT: 'xrpusd',
  ADAUSDT: 'adausd', DOGEUSDT: 'dogeusd', DOTUSDT: 'dotusd', LTCUSDT: 'ltcusd',
};

async function ladeBitstamp24hChange(symbol) {
  const pair = BITSTAMP_IDS[symbol];
  if (!pair) return null;
  try {
    const res = await fetch(`https://www.bitstamp.net/api/v2/ticker/${pair}/`);
    if (!res.ok) return null;
    const data = await res.json();
    const change = data && parseFloat(data.percent_change_24);
    return Number.isFinite(change) ? change : null;
  } catch {
    return null;
  }
}

// Mittelt bis zu 5 unabhängige Quellen (CoinGecko, CoinPaprika, OKX,
// Gate.io, Bitstamp), alle parallel abgefragt. Fällt eine oder mehrere aus,
// wird nur mit den verbliebenen gemittelt statt den Filter auszuschalten -
// erst wenn ALLE ausfallen, ist das Ergebnis null (Filter dann nicht
// blockierend, siehe Aufrufstelle in runSymbol). Bewusst als EIN
// gemittelter Wert statt fünf einzelne UND-Filter, sonst würde jede weitere
// Quelle Käufe nur noch seltener machen, statt die Bestätigung robuster zu
// machen.
async function ladePreisBestaetigung24h(symbol) {
  const werte = (await Promise.all([
    ladeCoingecko24hChange(symbol),
    ladeCoinpaprika24hChange(symbol),
    ladeOkx24hChange(symbol),
    ladeGateio24hChange(symbol),
    ladeBitstamp24hChange(symbol),
  ])).filter((w) => typeof w === 'number');
  if (!werte.length) return null;
  return werte.reduce((sum, w) => sum + w, 0) / werte.length;
}

// ================= FEAR & GREED INDEX (optionaler markweiter Kauf-Filter) =================
// Anders als der CoinGecko-Filter (pro Coin, 24h-Kursänderung) ist das ein
// EIN EINZIGER Wert für den GESAMTEN Kryptomarkt (0=Extreme Fear,
// 100=Extreme Greed) - deshalb nur einmal pro Lauf abgefragt, nicht pro
// Symbol. Passend zur bollinger-mean-reversion-Strategie (kauft gezielt
// Dips): blockiert NICHT bei Angst (das ist genau die Marktlage, in der
// die Strategie kaufen soll), sondern bei "Extreme Greed" - klassisches
// Kontra-Signal gegen Euphorie-Käufe kurz vor einem möglichen Top.
async function ladeFearGreedIndex() {
  try {
    const res = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!res.ok) return null;
    const data = await res.json();
    const wert = data && data.data && data.data[0] && parseInt(data.data[0].value, 10);
    return Number.isFinite(wert) ? wert : null;
  } catch {
    return null; // Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// ================= BTC-DOMINANZ-FILTER (optionaler markweiter Kauf-Filter) =================
// Wie der Fear&Greed-Filter EIN EINZIGER Wert für den ganzen Markt, nur
// einmal pro Lauf abgefragt. BTC-Dominanz = BTCs Anteil an der gesamten
// Krypto-Marktkapitalisierung. Steigt sie stark, fließt Kapital gerade
// bevorzugt in Bitcoin statt in Altcoins ("risk-off" für Alts) - der Filter
// blockiert deshalb NUR Altcoin-Käufe (nicht BTC selbst) oberhalb der
// konfigurierten Schwelle. Nutzt dieselbe CoinPaprika-API wie der
// 24h-Preisfilter oben, andere Endpunkt (global statt pro Coin).
async function ladeBtcDominanzProzent() {
  try {
    const res = await fetch('https://api.coinpaprika.com/v1/global');
    if (!res.ok) return null;
    const data = await res.json();
    const wert = data && data.bitcoin_dominance_percentage;
    return typeof wert === 'number' ? wert : null;
  } catch {
    return null;
  }
}

// ================= MEHRFACH-ZEITRAHMEN-BESTÄTIGUNG (optional) =================
// Prüft zusätzlich zum 15m-Signal einen deutlich längeren Zeitrahmen (Default
// 4h), um Käufe gegen den übergeordneten Trend zu vermeiden - klassisches
// Problem reiner 15m-Strategien: ein kurzfristiges Signal kann mitten in
// einem größeren Abwärtstrend auftreten. Bewertet den 4h-Trend über EMA9 vs.
// EMA21 (gleiche Logik wie ema-crossover, nur auf einem größeren Zeitfenster) -
// Aufwärtstrend = EMA9 > EMA21.
async function hoehererZeitrahmenIstAufwaerts(exchange, symbol, cfg) {
  try {
    const { closes } = await exchange.getKlines(symbol, cfg.mtfIntervalMinuten);
    const benoetigt = cfg.emaLangsam + 2;
    if (closes.length < benoetigt) return true; // zu wenig Historie - Filter nicht blockierend anwenden
    const fastSeries = emaSeries(closes, cfg.emaSchnell);
    const slowSeries = emaSeries(closes, cfg.emaLangsam);
    const n = closes.length - 1;
    return fastSeries[n] > slowSeries[n];
  } catch {
    return true; // Ausfall darf den Bot nie blockieren, nur den Filter deaktivieren
  }
}

// ================= WHATSAPP =================

async function notifyWhatsapp(env, text) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_TO_NUMBER) {
    console.log('[whatsapp] Nicht konfiguriert:', text);
    return;
  }
  try {
    await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: env.WHATSAPP_TO_NUMBER, type: 'text', text: { body: text, preview_url: true } }),
    });
  } catch (err) {
    console.error('[whatsapp] Fehler beim Senden:', err);
  }
}

// ================= STATE =================

function heute() {
  return new Date().toISOString().slice(0, 10);
}

const MAX_TRADES_IM_STATE = 50;

function initialerState(startKapital) {
  return {
    position: null,
    startKapital,
    kapital: startKapital,
    heutigerVerlustUsdt: 0,
    letzterTag: heute(),
    killSwitchAktiv: false,
    killSwitchBenachrichtigt: false,
    trades: [],
  };
}

async function loadState(env, symbol, startKapital) {
  const raw = await env.TRADING_STATE.get(`state:${symbol}`);
  if (!raw) return initialerState(startKapital);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.startKapital) return initialerState(startKapital);
    if (!Array.isArray(parsed.trades)) parsed.trades = [];
    return parsed;
  } catch {
    return initialerState(startKapital);
  }
}

async function saveState(env, symbol, state) {
  await env.TRADING_STATE.put(`state:${symbol}`, JSON.stringify(state));
}

async function zaehleOffenePositionen(env, symbols, startKapitalProSymbol) {
  let anzahl = 0;
  for (const symbol of symbols) {
    const state = await loadState(env, symbol, startKapitalProSymbol);
    if (state.position) anzahl++;
  }
  return anzahl;
}

// ================= HANDELSLOGIK =================

async function runSymbol(env, symbol, startKapital, cfg, offenePositionenVorLauf, fearGreedWert, btcDominanzProzent) {
  const exchange = EXCHANGES[cfg.exchange];
  let state = await loadState(env, symbol, startKapital);

  if (state.letzterTag !== heute()) {
    state.letzterTag = heute();
    state.heutigerVerlustUsdt = 0;
  }

  if (state.killSwitchAktiv) {
    if (!state.killSwitchBenachrichtigt) {
      await notifyWhatsapp(env, `🛑 Trading-Bot (${symbol}) GESTOPPT: Gesamtverlust-Grenze (${cfg.maxGesamtverlustProzent}%) erreicht. Kapital: ${state.kapital.toFixed(2)} USDT (Start: ${state.startKapital.toFixed(2)} USDT). Bleibt aus, bis der State für ${symbol} manuell zurückgesetzt wird.`);
      state.killSwitchBenachrichtigt = true;
      await saveState(env, symbol, state);
    }
    return;
  }

  const { closes, highs, lows } = await exchange.getKlines(symbol);
  // Genug Vorlauf für die Indikatoren ALLER Strategien prüfen, nicht nur
  // EMA - sonst würde z.B. donchianEntryPeriode=50 stillschweigend mit zu
  // wenig Historie rechnen, statt einfach diesen Lauf zu überspringen.
  const benoetigteKerzen = Math.max(cfg.emaLangsam, cfg.bollingerPeriode, cfg.donchianEntryPeriode) + 2;
  if (closes.length < benoetigteKerzen) return;

  const indikatoren = berechneIndikatoren(closes, highs, lows, cfg);
  const { preis } = indikatoren;
  const handelsSperreHeute = state.heutigerVerlustUsdt <= -(state.kapital * cfg.maxTagesverlustProzent) / 100;

  if (!state.position) {
    const positionenPlatzFrei = offenePositionenVorLauf < cfg.maxGleichzeitigePositionen;
    const kauf = entscheideKauf({ kapital: state.kapital, cfg, indikatoren, positionenPlatzFrei, handelsSperreHeute, kuerzlicheTrades: state.trades });

    if (kauf && cfg.mtfFilter) {
      const aufwaerts = await hoehererZeitrahmenIstAufwaerts(exchange, symbol, cfg);
      if (!aufwaerts) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - ${cfg.mtfIntervalMinuten / 60}h-Trend zeigt abwärts (EMA9 < EMA21).`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf && cfg.fngFilter && fearGreedWert !== null && fearGreedWert >= cfg.fngMaxWert) {
      await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - Fear & Greed Index bei ${fearGreedWert} (Extreme Greed ab ${cfg.fngMaxWert}), Markt wirkt überhitzt.`);
      await saveState(env, symbol, state);
      return;
    }

    // Nur Altcoins betroffen (BTC selbst profitiert typischerweise gerade
    // VON steigender Dominanz, wird also nicht geblockt).
    const istBtc = COINGECKO_IDS[symbol] === 'bitcoin';
    if (kauf && cfg.btcDominanzFilter && !istBtc && btcDominanzProzent !== null && btcDominanzProzent >= cfg.btcDominanzMaxProzent) {
      await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - BTC-Dominanz bei ${btcDominanzProzent.toFixed(1)}% (Schwelle ${cfg.btcDominanzMaxProzent}%), Kapital fließt gerade bevorzugt in Bitcoin statt Altcoins.`);
      await saveState(env, symbol, state);
      return;
    }

    if (kauf && cfg.coingeckoFilter) {
      const change24hProzent = await ladePreisBestaetigung24h(symbol);
      // null = kein Mapping für dieses Symbol oder ALLE Quellen (CoinGecko,
      // CoinPaprika, OKX, Gate.io, Bitstamp) nicht erreichbar - Filter dann
      // NICHT blockierend, sonst würde ein Datenausfall den Bot lahmlegen,
      // obwohl die eigentliche Strategie ein gültiges Signal hat.
      if (change24hProzent !== null && change24hProzent < cfg.coingeckoMin24hProzent) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - 24h-Änderung (Ø aus bis zu 5 Börsen) ${change24hProzent.toFixed(2)}% liegt unter dem Filter-Minimum (${cfg.coingeckoMin24hProzent}%).`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf && cfg.spreadFilter) {
      const spreadProzent = await exchange.getSpreadProzent(symbol);
      if (spreadProzent !== null && spreadProzent > cfg.spreadMaxProzent) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - Bid/Ask-Spread bei ${spreadProzent.toFixed(2)}% (Schwelle ${cfg.spreadMaxProzent}%), Liquidität wirkt gerade gestört.`);
        await saveState(env, symbol, state);
        return;
      }
    }

    if (kauf) {
      const { investBetrag } = kauf;
      const minNotional = await exchange.getMinNotionalUsdt(symbol, preis);
      if (minNotional !== null && investBetrag < minNotional) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - ${investBetrag.toFixed(2)} USDT liegt unter der Mindest-Ordergröße (${minNotional.toFixed(2)} USDT).`);
        await saveState(env, symbol, state);
        return;
      }

      let qty, tatsaechlicherPreis;
      if (cfg.paperModus) {
        qty = investBetrag / preis;
        tatsaechlicherPreis = preis;
      } else {
        const order = await exchange.placeMarketBuy(env, symbol, investBetrag, preis);
        qty = order.qty;
        tatsaechlicherPreis = order.preis;
      }
      state.position = { qty, entryPreis: tatsaechlicherPreis, hoechsterPreisSeitEinstieg: tatsaechlicherPreis, einstiegAm: new Date().toISOString() };
      await notifyWhatsapp(env, `📈 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Einstieg ${symbol} @ ${tatsaechlicherPreis.toFixed(2)} (${investBetrag.toFixed(2)} USDT eingesetzt${cfg.volaSizing ? `, Vola-Sizing aktiv` : ''}).`);
    }
  } else {
    const verkauf = entscheideVerkauf({ position: state.position, cfg, indikatoren });
    state.position.hoechsterPreisSeitEinstieg = verkauf.hoechsterPreisSeitEinstieg;

    if (verkauf.verkaufen) {
      let erloes;
      if (cfg.paperModus) {
        erloes = state.position.qty * preis;
      } else {
        const order = await exchange.placeMarketSell(env, symbol, state.position.qty);
        erloes = order.erloes;
      }
      const einsatz = state.position.qty * state.position.entryPreis;
      const gewinnVerlust = erloes - einsatz;
      const gewinnProzent = (gewinnVerlust / einsatz) * 100;
      state.kapital += gewinnVerlust;
      state.heutigerVerlustUsdt += Math.min(0, gewinnVerlust);

      state.trades.push({
        entryPreis: state.position.entryPreis,
        exitPreis: preis,
        gewinnVerlustUsdt: gewinnVerlust,
        gewinnProzent,
        grund: verkauf.grund,
        einstiegAm: state.position.einstiegAm,
        ausstiegAm: new Date().toISOString(),
      });
      if (state.trades.length > MAX_TRADES_IM_STATE) state.trades = state.trades.slice(-MAX_TRADES_IM_STATE);

      await notifyWhatsapp(env, `📉 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Ausstieg ${symbol} @ ${preis.toFixed(2)} (${verkauf.grund}). ${gewinnVerlust >= 0 ? 'Gewinn' : 'Verlust'}: ${gewinnVerlust.toFixed(2)} USDT. Kapital jetzt: ${state.kapital.toFixed(2)} USDT.`);
      state.position = null;

      const gesamtVerlustProzent = ((state.kapital - state.startKapital) / state.startKapital) * 100;
      if (gesamtVerlustProzent <= -cfg.maxGesamtverlustProzent) state.killSwitchAktiv = true;
    }
  }

  await saveState(env, symbol, state);
}

// Einmal pro Kalendertag eine WhatsApp-Zusammenfassung über alle Symbole,
// statt dass man selbst das Dashboard aufrufen muss, um zu sehen ob alles
// normal läuft. Läuft "nebenbei" im ohnehin alle 5 Minuten laufenden Cron -
// verschickt aber wirklich nur einmal pro Tag (KV-Marke digest:letzterTag).
async function pruefeUndSendeTagesZusammenfassung(env, cfg) {
  const heuteStr = heute();
  const letzte = await env.TRADING_STATE.get('digest:letzterTag');
  if (letzte === heuteStr) return;

  let gesamtKapitalJetzt = 0, gesamtStartKapital = 0, offenePositionen = 0;
  const killSwitchSymbole = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    gesamtKapitalJetzt += state.kapital;
    gesamtStartKapital += state.startKapital;
    if (state.position) offenePositionen++;
    if (state.killSwitchAktiv) killSwitchSymbole.push(symbol);
  }
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapitalJetzt - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;

  const text = `📊 Trading-Bot Tages-Update (${cfg.paperModus ? 'PAPER' : 'LIVE'}, ${cfg.exchange}):\n` +
    `Kapital gesamt: ${gesamtKapitalJetzt.toFixed(2)} USDT (Start: ${gesamtStartKapital.toFixed(2)} USDT, ${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(2)}%)\n` +
    `Offene Positionen: ${offenePositionen}/${cfg.symbols.length}` +
    (killSwitchSymbole.length ? `\n🛑 Kill-Switch aktiv bei: ${killSwitchSymbole.join(', ')}` : '');

  await notifyWhatsapp(env, text);
  await env.TRADING_STATE.put('digest:letzterTag', heuteStr);
}

// ISO-Kalenderwoche als Schlüssel (Jahr-KW), bleibt über Jahreswechsel hinweg eindeutig.
function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

// Einmal pro Kalenderwoche (montags) ein ausführlicherer Rückblick als das
// tägliche Update: P&L nur der letzten 7 Tage, bester/schlechtester Coin,
// Win-Rate-Trend - damit man nicht mehr manuell im Dashboard nachschauen muss,
// wie die Woche insgesamt lief. KV-Marke digest:letzteWoche verhindert
// Mehrfachversand bei mehreren Montags-Läufen.
async function pruefeUndSendeWochenZusammenfassung(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags prüfen
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.TRADING_STATE.get('digest:letzteWoche');
  if (letzte === aktuelleWoche) return;

  const seitZeitpunkt = jetzt.getTime() - 7 * 24 * 60 * 60 * 1000;
  let gesamtKapitalJetzt = 0, gesamtStartKapital = 0;
  const proSymbolPL = [];
  const allTradesDieseWoche = [];
  const alleTradesLifetime = [];
  const symboleFuerReadiness = [];
  const proStrategiePL = {}; // strategie -> { plDieseWoche, anzahlTrades }
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    gesamtKapitalJetzt += state.kapital;
    gesamtStartKapital += state.startKapital;
    const tradesDieseWoche = (state.trades || []).filter((t) => new Date(t.ausstiegAm).getTime() >= seitZeitpunkt);
    const plDieseWoche = tradesDieseWoche.reduce((sum, t) => sum + t.gewinnVerlustUsdt, 0);
    proSymbolPL.push({ symbol, plDieseWoche, anzahlTrades: tradesDieseWoche.length });
    allTradesDieseWoche.push(...tradesDieseWoche);
    alleTradesLifetime.push(...(state.trades || []));
    symboleFuerReadiness.push({ kapital: state.kapital, startKapital: state.startKapital, killSwitchAktiv: state.killSwitchAktiv });

    const strategie = cfg.strategieProSymbol[symbol] || cfg.strategie;
    if (!proStrategiePL[strategie]) proStrategiePL[strategie] = { plDieseWoche: 0, anzahlTrades: 0 };
    proStrategiePL[strategie].plDieseWoche += plDieseWoche;
    proStrategiePL[strategie].anzahlTrades += tradesDieseWoche.length;
  }
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapitalJetzt - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;
  const statsWoche = berechneTradeStats(allTradesDieseWoche);

  const gehandelt = proSymbolPL.filter((s) => s.anzahlTrades > 0).sort((a, b) => b.plDieseWoche - a.plDieseWoche);
  const bester = gehandelt[0];
  const schlechtester = gehandelt.length > 1 ? gehandelt[gehandelt.length - 1] : null;

  const zeilen = [
    `📅 Trading-Bot Wochen-Rückblick (${cfg.paperModus ? 'PAPER' : 'LIVE'}, ${cfg.exchange}):`,
    `Kapital gesamt: ${gesamtKapitalJetzt.toFixed(2)} USDT (${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(2)}% seit Start)`,
    `Trades diese Woche: ${allTradesDieseWoche.length}${statsWoche.winRateProzent !== null ? ` (Win-Rate ${statsWoche.winRateProzent.toFixed(0)}%)` : ''}`,
  ];
  if (bester) zeilen.push(`🏆 Bester Coin: ${bester.symbol} (${bester.plDieseWoche >= 0 ? '+' : ''}${bester.plDieseWoche.toFixed(2)} USDT)`);
  if (schlechtester) zeilen.push(`📉 Schlechtester Coin: ${schlechtester.symbol} (${schlechtester.plDieseWoche >= 0 ? '+' : ''}${schlechtester.plDieseWoche.toFixed(2)} USDT)`);

  // Nur relevant/interessant, wenn wirklich mehr als eine Strategie parallel
  // läuft (siehe TRADING_STRATEGIE_PRO_SYMBOL) - sonst wäre es identisch
  // zur Gesamtzeile oben.
  const strategieGruppen = Object.entries(proStrategiePL);
  if (strategieGruppen.length > 1) {
    zeilen.push('📊 Strategie-Vergleich diese Woche:');
    for (const [strategie, werte] of strategieGruppen.sort((a, b) => b[1].plDieseWoche - a[1].plDieseWoche)) {
      zeilen.push(`  ${strategie}: ${werte.plDieseWoche >= 0 ? '+' : ''}${werte.plDieseWoche.toFixed(2)} USDT (${werte.anzahlTrades} Trades)`);
    }
  }

  const readiness = berechneReadiness(symboleFuerReadiness, alleTradesLifetime);
  const readinessEmoji = { rot: '🔴', gelb: '🟡', gruen: '🟢' }[readiness.ampel];
  zeilen.push(`${readinessEmoji} Echtgeld-Readiness: ${readiness.ampel.toUpperCase()} - ${readiness.grund}`);

  await notifyWhatsapp(env, zeilen.join('\n'));
  await env.TRADING_STATE.put('digest:letzteWoche', aktuelleWoche);
}

// Erlaubt jedem Symbol eine ANDERE Strategie als den globalen Default -
// z.B. um live zu vergleichen, welche Strategie auf welchem Coin am besten
// abschneidet, statt alle Coins zwangsläufig identisch zu handeln. Format:
// "XBTUSDT:bollinger-mean-reversion,ETHUSDT:donchian-breakout". Symbole ohne
// Eintrag fallen auf TRADING_STRATEGIE (den globalen Default) zurück.
function parseStrategieProSymbol(env, gueltigeStrategien) {
  const roh = (env.TRADING_STRATEGIE_PRO_SYMBOL || '').trim();
  const map = {};
  if (!roh) return map;
  for (const eintrag of roh.split(',')) {
    const [symbol, strategie] = eintrag.split(':').map((s) => s.trim());
    if (!symbol || !strategie) continue;
    if (!gueltigeStrategien.includes(strategie)) {
      throw new Error(`Unbekannte Strategie "${strategie}" in TRADING_STRATEGIE_PRO_SYMBOL für ${symbol} - unterstützt: ${gueltigeStrategien.join(', ')}`);
    }
    map[symbol] = strategie;
  }
  return map;
}

function readConfig(env) {
  const symbols = (env.TRADING_SYMBOLS || 'BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const gesamtKapital = parseFloat(env.TRADING_KAPITAL_USDT || '100');
  const exchange = (env.TRADING_EXCHANGE || 'binance').trim().toLowerCase();
  if (!EXCHANGES[exchange]) throw new Error(`Unbekannte TRADING_EXCHANGE "${exchange}" - unterstützt: ${Object.keys(EXCHANGES).join(', ')}`);
  const strategie = (env.TRADING_STRATEGIE || 'ema-crossover').trim();
  const GUELTIGE_STRATEGIEN = ['ema-crossover', 'bollinger-mean-reversion', 'donchian-breakout'];
  if (!GUELTIGE_STRATEGIEN.includes(strategie)) {
    throw new Error(`Unbekannte TRADING_STRATEGIE "${strategie}" - unterstützt: ${GUELTIGE_STRATEGIEN.join(', ')}`);
  }
  const strategieProSymbol = parseStrategieProSymbol(env, GUELTIGE_STRATEGIEN);
  return {
    exchange,
    symbols,
    startKapitalProSymbol: gesamtKapital / symbols.length,
    paperModus: (env.TRADING_PAPER_MODE || 'ja') !== 'nein',
    // Default 'ema-crossover' = unverändertes Verhalten ggü. vorherigen Versionen.
    strategie,
    // Pro Symbol individuell überschreibbar, siehe parseStrategieProSymbol.
    strategieProSymbol,
    bollingerPeriode: parseInt(env.TRADING_BOLLINGER_PERIODE || '20', 10),
    bollingerStdDev: parseFloat(env.TRADING_BOLLINGER_STDDEV || '2'),
    donchianEntryPeriode: parseInt(env.TRADING_DONCHIAN_ENTRY_PERIODE || '20', 10),
    donchianExitPeriode: parseInt(env.TRADING_DONCHIAN_EXIT_PERIODE || '10', 10),
    maxPositionProzent: parseFloat(env.TRADING_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.TRADING_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.TRADING_STOP_LOSS_PROZENT || '3'),
    // Default 0 = aus, damit ein bestehendes Setup nicht ungefragt anders handelt.
    takeProfitProzent: parseFloat(env.TRADING_TAKE_PROFIT_PROZENT || '0'),
    emaSchnell: parseInt(env.TRADING_EMA_SCHNELL || '9', 10),
    emaLangsam: parseInt(env.TRADING_EMA_LANGSAM || '21', 10),
    rsiPeriode: parseInt(env.TRADING_RSI_PERIODE || '14', 10),
    // 0 = Filter deaktiviert (Default), damit ein bestehendes Setup nicht
    // durch dieses Update ungefragt anders handelt.
    rsiUeberkauft: parseFloat(env.TRADING_RSI_UEBERKAUFT || '0'),
    minVolatilitaetProzent: parseFloat(env.TRADING_MIN_VOLATILITAET_PROZENT || '0'),
    trailingStopAbProzent: parseFloat(env.TRADING_TRAILING_STOP_AB_PROZENT || '0'),
    volaSizing: (env.TRADING_VOLA_SIZING || 'nein') === 'ja',
    volaSizingReferenzProzent: parseFloat(env.TRADING_VOLA_SIZING_REFERENZ_PROZENT || '2'),
    volaSizingMinFaktor: parseFloat(env.TRADING_VOLA_SIZING_MIN_FAKTOR || '0.25'),
    maxGleichzeitigePositionen: env.TRADING_MAX_GLEICHZEITIGE_POSITIONEN
      ? parseInt(env.TRADING_MAX_GLEICHZEITIGE_POSITIONEN, 10)
      : symbols.length,
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders handelt.
    coingeckoFilter: (env.TRADING_COINGECKO_FILTER || 'nein') === 'ja',
    coingeckoMin24hProzent: parseFloat(env.TRADING_COINGECKO_MIN_24H_PROZENT || '0'),
    fngFilter: (env.TRADING_FNG_FILTER || 'nein') === 'ja',
    fngMaxWert: parseFloat(env.TRADING_FNG_MAX_WERT || '80'),
    mtfFilter: (env.TRADING_MTF_FILTER || 'nein') === 'ja',
    mtfIntervalMinuten: parseInt(env.TRADING_MTF_INTERVAL_MINUTEN || '240', 10),
    btcDominanzFilter: (env.TRADING_BTC_DOMINANZ_FILTER || 'nein') === 'ja',
    btcDominanzMaxProzent: parseFloat(env.TRADING_BTC_DOMINANZ_MAX_PROZENT || '60'),
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders
    // handelt. Skaliert die Positionsgröße NUR nach unten (nie über den
    // konfigurierten maxPositionProzent hinaus) - siehe strategie.mjs.
    performanceSizing: (env.TRADING_PERFORMANCE_SIZING || 'nein') === 'ja',
    performanceSizingMinFaktor: parseFloat(env.TRADING_PERFORMANCE_SIZING_MIN_FAKTOR || '0.5'),
    performanceSizingMinTrades: parseInt(env.TRADING_PERFORMANCE_SIZING_MIN_TRADES || '5', 10),
    // Default AUS, damit ein bereits laufendes Setup nicht ungefragt anders
    // handelt. Kein externer API-Call - nutzt dieselben Kerzen wie die
    // Strategie selbst.
    flashCrashFilter: (env.TRADING_FLASH_CRASH_FILTER || 'nein') === 'ja',
    flashCrashFensterKerzen: parseInt(env.TRADING_FLASH_CRASH_FENSTER_KERZEN || '4', 10),
    flashCrashMaxDropProzent: parseFloat(env.TRADING_FLASH_CRASH_MAX_DROP_PROZENT || '8'),
    // Spread-Filter: verwirft einen Kauf, wenn der Bid/Ask-Spread an der
    // Börse gerade ungewöhnlich breit ist (dünne/gestörte Liquidität - oft
    // ein Begleitsymptom eines Flash-Crashs oder Börsenproblems).
    spreadFilter: (env.TRADING_SPREAD_FILTER || 'nein') === 'ja',
    spreadMaxProzent: parseFloat(env.TRADING_SPREAD_MAX_PROZENT || '1'),
  };
}

async function runAll(env) {
  const cfg = readConfig(env);
  let offenePositionen = await zaehleOffenePositionen(env, cfg.symbols, cfg.startKapitalProSymbol);
  // Nur EINMAL pro Lauf abgefragt (marktweiter Wert, gilt für alle Symbole
  // gleich) statt pro Symbol - spart Anfragen und ist konsistent für alle
  // Coins in diesem Lauf.
  const fearGreedWert = cfg.fngFilter ? await ladeFearGreedIndex() : null;
  const btcDominanzProzent = cfg.btcDominanzFilter ? await ladeBtcDominanzProzent() : null;
  for (const symbol of cfg.symbols) {
    try {
      // Pro Symbol ggf. eigene Strategie (siehe strategieProSymbol) statt
      // zwangsläufig der globalen - alles andere (Filter, Risiko-Limits)
      // bleibt für alle Symbole identisch.
      const cfgSymbol = cfg.strategieProSymbol[symbol]
        ? { ...cfg, strategie: cfg.strategieProSymbol[symbol] }
        : cfg;
      const hatteVorherPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfgSymbol, offenePositionen, fearGreedWert, btcDominanzProzent);
      const hatJetztPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      if (!hatteVorherPosition && hatJetztPosition) offenePositionen++;
      if (hatteVorherPosition && !hatJetztPosition) offenePositionen--;
    } catch (err) {
      console.error(`[trading-bot] Fehler bei ${symbol}:`, err);
      await notifyWhatsapp(env, `🛑 Trading-Bot (${symbol}): Lauf mit Fehler abgebrochen - ${err.message || err}. Eine Order wurde dadurch möglicherweise NICHT ausgeführt, bitte Konto manuell prüfen.`);
    }
  }
  try {
    await pruefeUndSendeTagesZusammenfassung(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler bei Tages-Zusammenfassung:', err);
  }
  try {
    await pruefeUndSendeWochenZusammenfassung(env, cfg);
  } catch (err) {
    console.error('[trading-bot] Fehler bei Wochen-Zusammenfassung:', err);
  }
}

// ================= READ-ONLY STATUS (fürs Dashboard, kann nie traden) =================

// Reine Kennzahlen aus der Trade-Historie - keine Prognose, nur "was ist
// bisher passiert" (letzte MAX_TRADES_IM_STATE abgeschlossenen Trades).
function berechneTradeStats(trades) {
  if (!trades.length) return { anzahlTrades: 0, winRateProzent: null, avgGewinnProzent: null };
  const gewinnTrades = trades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const avgGewinnProzent = trades.reduce((sum, t) => sum + t.gewinnProzent, 0) / trades.length;
  return {
    anzahlTrades: trades.length,
    winRateProzent: (gewinnTrades / trades.length) * 100,
    avgGewinnProzent,
  };
}

// Grobe Ampel-Einschätzung, ob der Paper-Bot bisher "reif genug" für
// Echtgeld WIRKT - KEINE Finanzberatung, KEINE Erfolgsgarantie, nur ein
// Hinweis basierend auf den bisherigen eigenen Paper-Zahlen. Nutzt bewusst
// NUR Daten, die der Bot selbst schon hat (kein neuer API-Call): Anzahl
// abgeschlossener Trades, Gesamt-Win-Rate, Gesamt-P&L, ob irgendein Symbol
// gerade seinen Kill-Switch ausgelöst hat. Ein aktiver Kill-Switch ist
// IMMER Rot, unabhängig von allem anderen - das war ein echter Verlust bis
// zur konfigurierten Grenze.
function berechneReadiness(symbole, alleTrades) {
  const anzahlTrades = alleTrades.length;
  const gewinnTradesGesamt = alleTrades.filter((t) => t.gewinnVerlustUsdt > 0).length;
  const winRateProzent = anzahlTrades > 0 ? (gewinnTradesGesamt / anzahlTrades) * 100 : null;
  const gesamtKapital = symbole.reduce((sum, s) => sum + s.kapital, 0);
  const gesamtStartKapital = symbole.reduce((sum, s) => sum + s.startKapital, 0);
  const gesamtProzent = gesamtStartKapital > 0 ? ((gesamtKapital - gesamtStartKapital) / gesamtStartKapital) * 100 : 0;
  const killSwitchAktiv = symbole.some((s) => s.killSwitchAktiv);

  let ampel, grund;
  if (killSwitchAktiv) {
    ampel = 'rot';
    grund = 'Mindestens ein Symbol hat gerade seinen Kill-Switch ausgelöst (Gesamtverlust-Grenze erreicht).';
  } else if (anzahlTrades < 10) {
    ampel = 'rot';
    grund = `Erst ${anzahlTrades} abgeschlossene Trades - zu wenig Daten für eine verlässliche Einschätzung (Richtwert: mind. 30).`;
  } else if (gesamtProzent < 0) {
    ampel = 'rot';
    grund = `Insgesamt im Minus (${gesamtProzent.toFixed(1)}%) - noch nicht bereit für Echtgeld.`;
  } else if (anzahlTrades < 30 || (winRateProzent !== null && winRateProzent < 50)) {
    ampel = 'gelb';
    grund = `${anzahlTrades} Trades, Win-Rate ${winRateProzent !== null ? winRateProzent.toFixed(0) : '–'}% - positiv, aber noch nicht genug Daten oder Trefferquote für eine klare Empfehlung.`;
  } else {
    ampel = 'gruen';
    grund = `${anzahlTrades} Trades, Win-Rate ${winRateProzent.toFixed(0)}%, Gesamt ${gesamtProzent >= 0 ? '+' : ''}${gesamtProzent.toFixed(1)}% - wirkt nach bisherigen Paper-Zahlen reif für einen vorsichtigen Echtgeld-Test.`;
  }
  return { ampel, grund, anzahlTrades, winRateProzent, gesamtProzent, hinweis: 'Keine Finanzberatung, keine Erfolgsgarantie - nur eine grobe Einschätzung aus den bisherigen Paper-Zahlen.' };
}

async function buildStatus(env) {
  const cfg = readConfig(env);
  const symbole = [];
  const alleTrades = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    symbole.push({
      symbol,
      exchange: cfg.exchange,
      paperModus: cfg.paperModus,
      strategie: cfg.strategieProSymbol[symbol] || cfg.strategie,
      position: state.position,
      kapital: state.kapital,
      startKapital: state.startKapital,
      heutigerVerlustUsdt: state.heutigerVerlustUsdt,
      killSwitchAktiv: state.killSwitchAktiv,
      tradeStats: berechneTradeStats(state.trades || []),
    });
    alleTrades.push(...(state.trades || []));
  }
  return {
    updatedAt: new Date().toISOString(),
    exchange: cfg.exchange,
    paperModus: cfg.paperModus,
    readiness: berechneReadiness(symbole, alleTrades),
    symbole,
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAll(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/status' && request.method === 'GET') {
      if (!env.STATUS_READ_KEY || url.searchParams.get('key') !== env.STATUS_READ_KEY) {
        return new Response('Forbidden', { status: 403 });
      }
      const status = await buildStatus(env);
      return new Response(JSON.stringify(status), {
        status: 200,
        headers: { 'content-type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Manuelles Auslösen nur mit korrektem Trigger-Secret - sonst könnte
    // jeder, der die öffentliche Worker-URL kennt, echte Trades auslösen.
    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runAll(env);
    return new Response('OK - Lauf ausgeführt, siehe WhatsApp/Logs.', { status: 200 });
  },
};

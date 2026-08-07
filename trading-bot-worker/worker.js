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

import { berechneIndikatoren, entscheideKauf, entscheideVerkauf } from './lib/strategie.mjs';

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

  async getKlines(symbol) {
    const res = await fetch(`${this.baseUrl}/api/v3/klines?symbol=${symbol}&interval=15m&limit=${KLINES_LIMIT}`);
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

  async getKlines(symbol) {
    const res = await fetch(`${this.baseUrl}/0/public/OHLC?pair=${symbol}&interval=15`);
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

async function runSymbol(env, symbol, startKapital, cfg, offenePositionenVorLauf) {
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
  if (closes.length < cfg.emaLangsam + 2) return;

  const indikatoren = berechneIndikatoren(closes, highs, lows, cfg);
  const { preis } = indikatoren;
  const handelsSperreHeute = state.heutigerVerlustUsdt <= -(state.kapital * cfg.maxTagesverlustProzent) / 100;

  if (!state.position) {
    const positionenPlatzFrei = offenePositionenVorLauf < cfg.maxGleichzeitigePositionen;
    const kauf = entscheideKauf({ kapital: state.kapital, cfg, indikatoren, positionenPlatzFrei, handelsSperreHeute });

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
// normal läuft. Läuft "nebenbei" im ohnehin alle 15 Minuten laufenden Cron -
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

function readConfig(env) {
  const symbols = (env.TRADING_SYMBOLS || 'BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const gesamtKapital = parseFloat(env.TRADING_KAPITAL_USDT || '100');
  const exchange = (env.TRADING_EXCHANGE || 'binance').trim().toLowerCase();
  if (!EXCHANGES[exchange]) throw new Error(`Unbekannte TRADING_EXCHANGE "${exchange}" - unterstützt: ${Object.keys(EXCHANGES).join(', ')}`);
  const strategie = (env.TRADING_STRATEGIE || 'ema-crossover').trim();
  if (strategie !== 'ema-crossover' && strategie !== 'bollinger-mean-reversion') {
    throw new Error(`Unbekannte TRADING_STRATEGIE "${strategie}" - unterstützt: ema-crossover, bollinger-mean-reversion`);
  }
  return {
    exchange,
    symbols,
    startKapitalProSymbol: gesamtKapital / symbols.length,
    paperModus: (env.TRADING_PAPER_MODE || 'ja') !== 'nein',
    // Default 'ema-crossover' = unverändertes Verhalten ggü. vorherigen Versionen.
    strategie,
    bollingerPeriode: parseInt(env.TRADING_BOLLINGER_PERIODE || '20', 10),
    bollingerStdDev: parseFloat(env.TRADING_BOLLINGER_STDDEV || '2'),
    maxPositionProzent: parseFloat(env.TRADING_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.TRADING_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.TRADING_STOP_LOSS_PROZENT || '3'),
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
  };
}

async function runAll(env) {
  const cfg = readConfig(env);
  let offenePositionen = await zaehleOffenePositionen(env, cfg.symbols, cfg.startKapitalProSymbol);
  for (const symbol of cfg.symbols) {
    try {
      const hatteVorherPosition = (await loadState(env, symbol, cfg.startKapitalProSymbol)).position !== null;
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfg, offenePositionen);
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

async function buildStatus(env) {
  const cfg = readConfig(env);
  const symbole = [];
  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    symbole.push({
      symbol,
      exchange: cfg.exchange,
      paperModus: cfg.paperModus,
      position: state.position,
      kapital: state.kapital,
      startKapital: state.startKapital,
      heutigerVerlustUsdt: state.heutigerVerlustUsdt,
      killSwitchAktiv: state.killSwitchAktiv,
      tradeStats: berechneTradeStats(state.trades || []),
    });
  }
  return { updatedAt: new Date().toISOString(), exchange: cfg.exchange, paperModus: cfg.paperModus, symbole };
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

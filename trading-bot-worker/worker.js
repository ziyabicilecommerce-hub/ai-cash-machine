// Krypto-Spot-Trading-Bot als Cloudflare Worker (statt GitHub Actions).
//
// Warum ein eigener Worker? GitHub-Actions-Runner laufen aus IP-Bereichen,
// die Binance aus regulatorischen Gründen mit HTTP 451 blockiert - der Bot
// (automations/49-trading-bot.mjs) konnte deshalb NIE eine einzige Order
// abfragen, obwohl der Workflow selbst korrekt lief. Cloudflare Workers
// laufen am globalen Edge-Netzwerk und sind davon i.d.R. nicht betroffen.
//
// Gleiche Sicherheitsmechanismen wie der GitHub-Actions-Bot, unverändert:
// Paper-Modus per Default, Spot-only (kein Hebel), Stop-Loss pro Trade,
// Tagesverlust-Handelssperre, dauerhafter Gesamtverlust-Kill-Switch,
// Mindest-Ordergröße-Check vor jedem Kauf.
//
// NEU gegenüber der GitHub-Actions-Version: mehrere Symbole gleichzeitig.
// Jedes Symbol bekommt sein EIGENES, unabhängiges Kapital (TRADING_KAPITAL_USDT
// wird durch die Anzahl Symbole geteilt) und seinen eigenen State/Kill-Switch -
// dein Gesamtrisiko bleibt exakt so hoch wie konfiguriert, egal wie viele
// Coins du hinzufügst.

const BASE_URL = 'https://api.binance.com';
const INTERVAL = '15m';
const KLINES_LIMIT = 100;

function hexFromBuffer(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return hexFromBuffer(sig);
}

async function signedRequest(env, path, params = {}, method = 'GET') {
  const fullParams = { ...params, timestamp: Date.now(), recvWindow: '10000' };
  const query = new URLSearchParams(fullParams).toString();
  const signature = await hmacSha256Hex(env.BINANCE_API_SECRET, query);
  const res = await fetch(`${BASE_URL}${path}?${query}&signature=${signature}`, {
    method,
    headers: { 'X-MBX-APIKEY': env.BINANCE_API_KEY },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Binance-Fehler (${res.status}): ${data.msg || JSON.stringify(data)}`);
  return data;
}

async function getKlines(symbol) {
  const res = await fetch(`${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${INTERVAL}&limit=${KLINES_LIMIT}`);
  if (!res.ok) throw new Error(`Binance Klines-Fehler: ${res.status}`);
  const data = await res.json();
  return data.map((k) => parseFloat(k[4]));
}

async function getMinNotional(symbol) {
  const res = await fetch(`${BASE_URL}/api/v3/exchangeInfo?symbol=${symbol}`);
  if (!res.ok) throw new Error(`Binance ExchangeInfo-Fehler: ${res.status}`);
  const data = await res.json();
  const filters = (data.symbols && data.symbols[0] && data.symbols[0].filters) || [];
  const filter = filters.find((f) => f.filterType === 'NOTIONAL' || f.filterType === 'MIN_NOTIONAL');
  return filter ? parseFloat(filter.minNotional) : null;
}

async function placeMarketBuy(env, symbol, quoteOrderQtyUsdt) {
  return signedRequest(env, '/api/v3/order', { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: quoteOrderQtyUsdt.toFixed(2) }, 'POST');
}

async function placeMarketSell(env, symbol, quantity) {
  return signedRequest(env, '/api/v3/order', { symbol, side: 'SELL', type: 'MARKET', quantity: String(quantity) }, 'POST');
}

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

function emaSeries(closes, period) {
  const k = 2 / (period + 1);
  const out = [closes[0]];
  for (let i = 1; i < closes.length; i++) out.push(closes[i] * k + out[i - 1] * (1 - k));
  return out;
}

function heute() {
  return new Date().toISOString().slice(0, 10);
}

function initialerState(startKapital) {
  return {
    position: null,
    startKapital,
    kapital: startKapital,
    heutigerVerlustUsdt: 0,
    letzterTag: heute(),
    killSwitchAktiv: false,
    killSwitchBenachrichtigt: false,
  };
}

async function loadState(env, symbol, startKapital) {
  const raw = await env.TRADING_STATE.get(`state:${symbol}`);
  if (!raw) return initialerState(startKapital);
  try {
    const parsed = JSON.parse(raw);
    return parsed.startKapital ? parsed : initialerState(startKapital);
  } catch {
    return initialerState(startKapital);
  }
}

async function saveState(env, symbol, state) {
  await env.TRADING_STATE.put(`state:${symbol}`, JSON.stringify(state));
}

async function runSymbol(env, symbol, startKapital, cfg) {
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

  const closes = await getKlines(symbol);
  if (closes.length < cfg.emaLangsam + 2) return;

  const fastSeries = emaSeries(closes, cfg.emaSchnell);
  const slowSeries = emaSeries(closes, cfg.emaLangsam);
  const n = closes.length;
  const diffJetzt = fastSeries[n - 1] - slowSeries[n - 1];
  const diffVorher = fastSeries[n - 2] - slowSeries[n - 2];
  const crossUp = diffVorher <= 0 && diffJetzt > 0;
  const crossDown = diffVorher >= 0 && diffJetzt < 0;
  const preis = closes[n - 1];

  const handelsSperreHeute = state.heutigerVerlustUsdt <= -(state.kapital * cfg.maxTagesverlustProzent) / 100;

  if (!state.position) {
    if (!handelsSperreHeute && crossUp) {
      const investBetrag = (state.kapital * cfg.maxPositionProzent) / 100;
      const minNotional = await getMinNotional(symbol);

      if (minNotional !== null && investBetrag < minNotional) {
        await notifyWhatsapp(env, `⚠️ Trading-Bot (${symbol}): Kaufsignal übersprungen - ${investBetrag.toFixed(2)} USDT liegt unter Binances Mindest-Ordergröße (${minNotional.toFixed(2)} USDT).`);
        await saveState(env, symbol, state);
        return;
      }

      let qty, tatsaechlicherPreis;
      if (cfg.paperModus) {
        qty = investBetrag / preis;
        tatsaechlicherPreis = preis;
      } else {
        const order = await placeMarketBuy(env, symbol, investBetrag);
        qty = parseFloat(order.executedQty);
        // Binance kann eine Order mit HTTP 200 zurückgeben, ohne dass sie
        // (vollständig) ausgeführt wurde (status "EXPIRED", executedQty "0").
        // Ungeprüft würde qty=0 zu entryPreis=NaN führen und der Stop-Loss
        // (preis <= NaN ist immer false) wäre für immer wirkungslos, ohne
        // dass es jemand merkt - lieber laut abbrechen als das.
        if (!(qty > 0) || order.status !== 'FILLED') {
          throw new Error(`Kauf-Order für ${symbol} wurde nicht vollständig ausgeführt (status=${order.status}, executedQty=${order.executedQty}) - kein Einstieg gebucht.`);
        }
        tatsaechlicherPreis = parseFloat(order.cummulativeQuoteQty) / qty;
      }
      state.position = { qty, entryPreis: tatsaechlicherPreis, einstiegAm: new Date().toISOString() };
      await notifyWhatsapp(env, `📈 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Einstieg ${symbol} @ ${tatsaechlicherPreis.toFixed(2)} USDT (${investBetrag.toFixed(2)} USDT eingesetzt).`);
    }
  } else {
    const stopLossPreis = state.position.entryPreis * (1 - cfg.stopLossProzent / 100);
    if (crossDown || preis <= stopLossPreis) {
      let erloes;
      if (cfg.paperModus) {
        erloes = state.position.qty * preis;
      } else {
        const order = await placeMarketSell(env, symbol, state.position.qty);
        // Gleiche Absicherung wie beim Kauf: ohne Fill-Check könnte eine nicht
        // ausgeführte Verkauf-Order fälschlich als geschlossene Position mit
        // erloes=0 verbucht werden, während die echte Position bei Binance
        // weiterläuft.
        if (!(parseFloat(order.executedQty) > 0) || order.status !== 'FILLED') {
          throw new Error(`Verkauf-Order für ${symbol} wurde nicht vollständig ausgeführt (status=${order.status}, executedQty=${order.executedQty}) - Position bleibt im State offen, bitte Binance-Konto manuell prüfen.`);
        }
        erloes = parseFloat(order.cummulativeQuoteQty);
      }
      const einsatz = state.position.qty * state.position.entryPreis;
      const gewinnVerlust = erloes - einsatz;
      state.kapital += gewinnVerlust;
      state.heutigerVerlustUsdt += Math.min(0, gewinnVerlust);

      const grund = preis <= stopLossPreis ? 'Stop-Loss' : 'EMA-Crossover';
      await notifyWhatsapp(env, `📉 ${cfg.paperModus ? '[PAPER] ' : ''}Trading-Bot: Ausstieg ${symbol} @ ${preis.toFixed(2)} USDT (${grund}). ${gewinnVerlust >= 0 ? 'Gewinn' : 'Verlust'}: ${gewinnVerlust.toFixed(2)} USDT. Kapital jetzt: ${state.kapital.toFixed(2)} USDT.`);
      state.position = null;

      const gesamtVerlustProzent = ((state.kapital - state.startKapital) / state.startKapital) * 100;
      if (gesamtVerlustProzent <= -cfg.maxGesamtverlustProzent) state.killSwitchAktiv = true;
    }
  }

  await saveState(env, symbol, state);
}

function readConfig(env) {
  const symbols = (env.TRADING_SYMBOLS || 'BTCUSDT').split(',').map((s) => s.trim()).filter(Boolean);
  const gesamtKapital = parseFloat(env.TRADING_KAPITAL_USDT || '100');
  return {
    symbols,
    startKapitalProSymbol: gesamtKapital / symbols.length,
    paperModus: (env.TRADING_PAPER_MODE || 'ja') !== 'nein',
    maxPositionProzent: parseFloat(env.TRADING_MAX_POSITION_PROZENT || '25'),
    maxTagesverlustProzent: parseFloat(env.TRADING_MAX_TAGESVERLUST_PROZENT || '5'),
    maxGesamtverlustProzent: parseFloat(env.TRADING_MAX_GESAMTVERLUST_PROZENT || '20'),
    stopLossProzent: parseFloat(env.TRADING_STOP_LOSS_PROZENT || '3'),
    emaSchnell: parseInt(env.TRADING_EMA_SCHNELL || '9', 10),
    emaLangsam: parseInt(env.TRADING_EMA_LANGSAM || '21', 10),
  };
}

async function runAll(env) {
  const cfg = readConfig(env);
  for (const symbol of cfg.symbols) {
    try {
      await runSymbol(env, symbol, cfg.startKapitalProSymbol, cfg);
    } catch (err) {
      console.error(`[trading-bot] Fehler bei ${symbol}:`, err);
      await notifyWhatsapp(env, `🛑 Trading-Bot (${symbol}): Lauf mit Fehler abgebrochen - ${err.message || err}. Eine Order wurde dadurch möglicherweise NICHT ausgeführt, bitte Binance-Konto manuell prüfen.`);
    }
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAll(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    // Manuelles Auslösen nur mit korrektem Trigger-Secret - sonst könnte
    // jeder, der die öffentliche Worker-URL kennt, echte Trades auslösen.
    if (url.searchParams.get('key') !== env.TRIGGER_SECRET || !env.TRIGGER_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runAll(env);
    return new Response('OK - Lauf ausgeführt, siehe WhatsApp/Logs.', { status: 200 });
  },
};

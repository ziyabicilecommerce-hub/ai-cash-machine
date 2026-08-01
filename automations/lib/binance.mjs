import { createHmac } from 'node:crypto';
import { config } from './config.mjs';

const BASE_URL = 'https://api.binance.com';

function sign(params) {
  const query = new URLSearchParams(params).toString();
  const signature = createHmac('sha256', config.BINANCE_API_SECRET).update(query).digest('hex');
  return `${query}&signature=${signature}`;
}

async function signedRequest(path, params = {}, method = 'GET') {
  const fullParams = { ...params, timestamp: Date.now(), recvWindow: 10000 };
  const query = sign(fullParams);
  const res = await fetch(`${BASE_URL}${path}?${query}`, {
    method,
    headers: { 'X-MBX-APIKEY': config.BINANCE_API_KEY },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Binance-Fehler (${res.status}): ${data.msg || JSON.stringify(data)}`);
  }
  return data;
}

// Öffentliche Kerzendaten - kein API-Key nötig, funktioniert für Strategie-
// Berechnung unabhängig von Paper/Live.
export async function getKlines(symbol, interval, limit = 100) {
  const res = await fetch(`${BASE_URL}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
  if (!res.ok) throw new Error(`Binance Klines-Fehler: ${res.status}`);
  const data = await res.json();
  // Kline-Format: [openTime, open, high, low, close, volume, ...]
  return data.map((k) => ({ close: parseFloat(k[4]) }));
}

export async function getAccountBalance(asset) {
  const data = await signedRequest('/api/v3/account');
  const bal = (data.balances || []).find((b) => b.asset === asset);
  return bal ? parseFloat(bal.free) : 0;
}

// Kauf: quoteOrderQty (fester USDT-Betrag, den wir investieren wollen).
export async function placeMarketBuy(symbol, quoteOrderQtyUsdt) {
  return signedRequest(
    '/api/v3/order',
    { symbol, side: 'BUY', type: 'MARKET', quoteOrderQty: quoteOrderQtyUsdt.toFixed(2) },
    'POST',
  );
}

// Verkauf: quantity (die tatsächlich gehaltene Menge des Basis-Assets) -
// NICHT quoteOrderQty, sonst würde bei Kursänderung seit dem Kauf nur ein
// fester USDT-Gegenwert verkauft statt der kompletten Position.
export async function placeMarketSell(symbol, quantity) {
  return signedRequest(
    '/api/v3/order',
    { symbol, side: 'SELL', type: 'MARKET', quantity: String(quantity) },
    'POST',
  );
}

// Persistenter Zustand pro Symbol in Cloudflare KV (Kapital, offene
// Position, Trade-Historie, Kill-Switch). Reine Lese-/Schreibfunktionen,
// keine Entscheidungslogik - die liegt in strategie.mjs und worker.js.

export function heute() {
  return new Date().toISOString().slice(0, 10);
}

export const MAX_TRADES_IM_STATE = 50;

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

export async function loadState(env, symbol, startKapital) {
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

export async function saveState(env, symbol, state) {
  await env.TRADING_STATE.put(`state:${symbol}`, JSON.stringify(state));
}

export async function zaehleOffenePositionen(env, symbols, startKapitalProSymbol) {
  let anzahl = 0;
  for (const symbol of symbols) {
    const state = await loadState(env, symbol, startKapitalProSymbol);
    if (state.position) anzahl++;
  }
  return anzahl;
}

// Markweite Werte (Fear&Greed, BTC-Dominanz), die ohnehin schon einmal pro
// Lauf für die Kauf-Filter geladen werden - hier zwischengespeichert statt
// bei jedem Dashboard-Aufruf erneut extern abgefragt (würde CoinGecko/
// CoinPaprika/alternative.me unnötig oft treffen, gerade bei einem
// Dashboard, das alle 30s aktualisiert). Für /status "gut genug aktuell"
// (maximal so alt wie der letzte Cron-Lauf, alle 5 Minuten).
export async function loadSystemInfo(env) {
  const raw = await env.TRADING_STATE.get('system:info');
  if (!raw) return { letzterLauf: null, fearGreedWert: null, fearGreedZeit: null, btcDominanzProzent: null, btcDominanzZeit: null };
  try {
    return JSON.parse(raw);
  } catch {
    return { letzterLauf: null, fearGreedWert: null, fearGreedZeit: null, btcDominanzProzent: null, btcDominanzZeit: null };
  }
}

export async function saveSystemInfo(env, patch) {
  const bisherig = await loadSystemInfo(env);
  await env.TRADING_STATE.put('system:info', JSON.stringify({ ...bisherig, ...patch }));
}

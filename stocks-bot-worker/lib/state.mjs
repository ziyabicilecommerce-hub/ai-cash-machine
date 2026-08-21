// Persistenter Zustand pro Aktien-Symbol in Cloudflare KV (Kapital, offene
// Position, Trade-Historie, Kill-Switch). Reine Lese-/Schreibfunktionen,
// keine Entscheidungslogik - die liegt in strategie.mjs und worker.js.
// Gleiches Muster wie trading-bot-worker/lib/state.mjs, eigener KV-
// Namespace (unabhängiges Kapital, unabhängige Trade-Historie).

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
    // Siehe lib/insiderbuys.mjs - einmal täglich aktualisiert, null bis zur
    // ersten Prüfung.
    insiderSignal: null,
    insiderSignalGeprueftAm: null,
    // Siehe lib/learning.mjs - einmal wöchentlich aktualisiert, null bis
    // genug Verlust-Trades vorliegen. Wirkt sich nur auf NEU eröffnete
    // Positionen aus (dort beim Einstieg eingefroren).
    gelernterStopLossProzent: null,
  };
}

export async function loadState(env, symbol, startKapital) {
  const raw = await env.STOCKS_STATE.get(`state:${symbol}`);
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
  await env.STOCKS_STATE.put(`state:${symbol}`, JSON.stringify(state));
}

export async function zaehleOffenePositionen(env, symbols, startKapitalProSymbol) {
  let anzahl = 0;
  for (const symbol of symbols) {
    const state = await loadState(env, symbol, startKapitalProSymbol);
    if (state.position) anzahl++;
  }
  return anzahl;
}

// Symbole mit aktuell offener Position - für den Korrelations-Filter (siehe
// lib/korrelation.mjs, Pendant zum Krypto-Bot).
export async function sammleOffenePositionenSymbole(env, symbols, startKapitalProSymbol) {
  const offen = [];
  for (const symbol of symbols) {
    const state = await loadState(env, symbol, startKapitalProSymbol);
    if (state.position) offen.push(symbol);
  }
  return offen;
}

export async function loadSystemInfo(env) {
  const raw = await env.STOCKS_STATE.get('system:info');
  const leer = { letzterLauf: null, marktOffen: null, newsEventAktiv: false, newsEventZeit: null, marktweiterCrashAktiv: false, marktweiterCrashZeit: null };
  if (!raw) return leer;
  try {
    return { ...leer, ...JSON.parse(raw) };
  } catch {
    return leer;
  }
}

export async function saveSystemInfo(env, patch) {
  const bisherig = await loadSystemInfo(env);
  await env.STOCKS_STATE.put('system:info', JSON.stringify({ ...bisherig, ...patch }));
}

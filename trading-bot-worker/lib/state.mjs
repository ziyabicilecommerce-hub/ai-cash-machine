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

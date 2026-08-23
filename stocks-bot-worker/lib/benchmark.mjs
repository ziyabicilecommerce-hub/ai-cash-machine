// "Bist du besser als der Markt?" - zwei Vergleiche: (1) die eigene Paper-
// Portfolio-Rendite gegen ein simples Buy-&-Hold DERSELBEN Aktien seit dem
// jeweils ersten eigenen Trade (gewichtet nach Startkapital) - beantwortet
// "hat die aktive Strategie überhaupt einen Vorteil gegenüber Kaufen-und-
// Liegenlassen?". (2) dieselbe Portfolio-Rendite gegen den S&P 500 (via SPY,
// überall auf Alpaca abrufbar, egal welche Aktien konfiguriert sind) seit dem
// allerersten eigenen Trade - der klassische "durchschnittlicher Investor"-
// Vergleich. Reiner Nachher-Vergleich, ändert nie eine Order. Läuft als Teil
// der Montags-Wartung.

import { loadState } from './state.mjs';
import { getBuyHoldRendite } from './alpaca.mjs';

const SPY_SYMBOL = 'SPY';

function wochenSchluessel(datum) {
  const d = new Date(Date.UTC(datum.getUTCFullYear(), datum.getUTCMonth(), datum.getUTCDate()));
  const tagNummer = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - tagNummer);
  const jahresStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d - jahresStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(kw).padStart(2, '0')}`;
}

export async function pruefeUndAktualisiereBenchmark(env, cfg) {
  const jetzt = new Date();
  if (jetzt.getUTCDay() !== 1) return; // nur montags, wie die anderen Wochen-Checks
  const aktuelleWoche = wochenSchluessel(jetzt);
  const letzte = await env.STOCKS_STATE.get('benchmark:letzteWoche');
  if (letzte === aktuelleWoche) return;

  let gesamtKapital = 0, gesamtStart = 0;
  let startKapitalMitTrades = 0, gewichteteBuyHoldSumme = 0;
  let ersterTradeGesamt = null;
  const proSymbol = [];

  for (const symbol of cfg.symbols) {
    const state = await loadState(env, symbol, cfg.startKapitalProSymbol);
    const trades = state.trades || [];
    gesamtKapital += state.kapital;
    gesamtStart += state.startKapital;
    if (!trades.length) continue;
    const ersterTrade = trades.reduce((min, t) => (new Date(t.einstiegAm) < new Date(min.einstiegAm) ? t : min), trades[0]);
    if (!ersterTradeGesamt || new Date(ersterTrade.einstiegAm) < new Date(ersterTradeGesamt)) ersterTradeGesamt = ersterTrade.einstiegAm;
    try {
      const buyHold = await getBuyHoldRendite(env, symbol, ersterTrade.einstiegAm);
      if (buyHold) {
        startKapitalMitTrades += state.startKapital;
        gewichteteBuyHoldSumme += buyHold.renditeProzent * state.startKapital;
        proSymbol.push({ symbol, seit: ersterTrade.einstiegAm, buyHoldRenditeProzent: buyHold.renditeProzent });
      }
    } catch (err) {
      console.error(`[stocks-bot] Benchmark ${symbol} fehlgeschlagen:`, err);
    }
  }

  if (!proSymbol.length || gesamtStart <= 0 || !startKapitalMitTrades || !ersterTradeGesamt) return; // noch keine Trade-Historie - kein sinnvoller Vergleich möglich

  const botRenditeProzent = ((gesamtKapital / gesamtStart) - 1) * 100;
  const buyHoldRenditeProzent = gewichteteBuyHoldSumme / startKapitalMitTrades;

  let spRenditeProzent = null;
  try {
    const spy = await getBuyHoldRendite(env, SPY_SYMBOL, ersterTradeGesamt);
    if (spy) spRenditeProzent = spy.renditeProzent;
  } catch (err) {
    console.error('[stocks-bot] Benchmark S&P-500-Abruf fehlgeschlagen:', err);
  }

  await env.STOCKS_STATE.put('benchmark:letzte', JSON.stringify({
    datum: jetzt.toISOString(),
    seit: ersterTradeGesamt,
    botRenditeProzent,
    buyHoldRenditeProzent,
    spRenditeProzent,
    proSymbol,
  }));
  await env.STOCKS_STATE.put('benchmark:letzteWoche', aktuelleWoche);
}
